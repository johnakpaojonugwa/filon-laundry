import Order from "../models/order.model.js";
import Branch from "../models/branch.model.js";
import Employee from "../models/employee.model.js";
import Inventory from "../models/inventory.model.js";
import StockLog from "../models/stockLog.model.js";
import { sendResponse, sendError } from "../utils/response.js";
import { logger } from "../utils/logger.js";
import mongoose from "mongoose";
import { isValidObjectId, sanitizeInput, sanitizeForRegex } from "../utils/validators.js";
import { analyticsService } from "../services/analyticsService.js";

// Inventory Deductions
const INVENTORY_TRANSITIONS = [
  {
    from: "processing",
    to: "washing",
    category: "detergent", 
    quantity: 1,
    reason: (order_number) => `Order ${order_number} - Wash Started`,
  },
  {
    from: "washing",
    to: "drying",
    category: "softener",
    quantity: 1,
    reason: (order_number) => `Order ${order_number} - drying Started`,
  },
  {
    from: "ironing",
    to: "ready",
    category: "packaging",
    quantity: 1,
    reason: (order_number) => `Order ${order_number} - Packaged for Pickup`,
  },
];

// Deduct inventory for a given transition
const deductInventoryForTransition = async (oldStatus, newStatus, order, session, performed_by) => {
  const rule = INVENTORY_TRANSITIONS.find(
    (transition) => transition.from === oldStatus && transition.to === newStatus
  );

  if (!rule) return null;
  
  // Check StockLog to avoid double-deducting for the same order and rule
  const existingLog = await StockLog.findOne({
    orderId: order._id,
    change_type: 'usage',
    reason: rule.reason(order.order_number)
  }).session(session);

  if (existingLog) {
    logger.info(`Inventory for ${newStatus} already deducted for order ${order.order_number}. skipping.`);
    return null;
  }

  const item = await Inventory.findOne({
    branchId: order.branchId,
    category: { $regex: new RegExp(`^${rule.category}$`, "i") },
    is_active: true,
  }).session(session);

  if (!item || item.current_stock < rule.quantity) {
    const friendlyCategory = rule.category.charAt(0).toLowerCase() + rule.category.slice(1);
    throw {
      statusCode: 400,
      message: `Insufficient ${friendlyCategory} in stock. Please restock before proceeding to ${newStatus}.`,
    };
  }

  item.current_stock -= rule.quantity;
  await item.save({ session });

  // Log the stock change with order reference for better traceability
  await StockLog.create(
    [
      {
        inventoryId: item._id,
        branchId: order.branchId,
        performed_by,
        change_type: "usage",
        quantity_changed: -rule.quantity,
        new_stock_level: item.current_stock,
        reason: rule.reason(order.order_number),
        orderId: order._id,
      },
    ],
    { session }
  );

  return item;
};

// Safe employee task adjustments (prevent negative counts)
const adjustEmployeeAssignedTasks = async (employeeId, delta, session) => {
  if (!employeeId) return;
  const employee = await Employee.findById(employeeId).session(session);
  if (!employee) {
    logger.warn(`Employee not found: ${employeeId}`);
    return;
  }
  const current = Number(employee.assigned_tasks || 0);
  const updated = Math.max(0, current + delta);
  if (updated === current) return;
  employee.assigned_tasks = updated;
  await employee.save({ session });
};

const adjustEmployeeCompletedTasks = async (employeeId, delta, session) => {
  if (!employeeId) return;
  const employee = await Employee.findById(employeeId).session(session);
  if (!employee) {
    logger.warn(`Employee not found: ${employeeId}`);
    return;
  }
  const current = Number(employee.completed_tasks || 0);
  const updated = Math.max(0, current + delta);
  if (updated === current) return;
  employee.completed_tasks = updated;
  await employee.save({ session });
};

// Create Order
export const createOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      customerId, branchId, customer_name, customer_phone, service_type,
      items, pickup_date, delivery_date, priority, discount, assigned_employee,
    } = req.body;

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      return sendError(res, 400, "At least one item is required");
    }

    // Normalize pickup_date
    const requestedPickup = new Date(pickup_date).setHours(0, 0, 0, 0);
    const today = new Date().setHours(0, 0, 0, 0);
    if (requestedPickup < today) {
      await session.abortTransaction();
      return sendError(res, 400, "Pickup date cannot be in the past");
    }

    // Validate items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.item_type || item.quantity <= 0 || item.unit_price < 0) {
        await session.abortTransaction();
        return sendError(res, 400, `Invalid item at index ${i}`);
      }
    }

    // Determine effective IDs based on role
    const effectiveBranchId = req.user.role === "customer" ? req.user.branchId : branchId;
    const effective_customerId = req.user.role === "customer" ? req.user.id : customerId;

    if (!effectiveBranchId || !isValidObjectId(effectiveBranchId)) {
      await session.abortTransaction();
      return sendError(res, 400, "Valid branch ID is required");
    }

    if (!effective_customerId || !isValidObjectId(effective_customerId)) {
      await session.abortTransaction();
      return sendError(res, 400, "Valid customer ID is required");
    }

    // Validate priority enum
    const valid_priorities = ['normal', 'express', 'urgent'];
    const effective_priority = priority?.toLowerCase() || 'normal';
    if (!valid_priorities.includes(effective_priority)) {
      await session.abortTransaction();
      return sendError(res, 400, "Invalid priority value");
    }

    // Validate service_type enum
    const effective_service_type = service_type?.toLowerCase() || 'wash_fold';
    const valid_service_types = ['wash_fold', 'ironing', 'dry_cleaning', 'stain_removal', 'alterations'];
    if (!valid_service_types.includes(effective_service_type)) {
      await session.abortTransaction();
      return sendError(res, 400, "Invalid service type value");
    }

    // Validate discount and amount
    const effective_discount = Math.max(0, Math.min(100, discount || 0));

    // Create Order
    const order = new Order({
      customerId: effective_customerId,
      customer_name: sanitizeInput(customer_name),
      customer_phone: sanitizeInput(customer_phone),
      branchId: effectiveBranchId,
      service_type: effective_service_type,
      items: items.map(i => ({
        item_type: sanitizeInput(i.item_type),
        quantity: Math.max(1, parseInt(i.quantity) || 1),
        unit_price: Math.max(0, parseFloat(i.unit_price) || 0)
      })),
      pickup_date: new Date(pickup_date),
      delivery_date: delivery_date ? new Date(delivery_date) : null,
      priority: effective_priority,
      discount: effective_discount,
      assigned_employee: assigned_employee && isValidObjectId(assigned_employee) ? assigned_employee : undefined,
      created_by: req.user.id || req.user._id,
      status: "pending",
      payment_status: "unpaid",
    });

    await order.save({ session });
    
    // If an employee was assigned at creation, increment their assigned_tasks safely
    if (order.assigned_employee) {
      await adjustEmployeeAssignedTasks(order.assigned_employee, 1, session);
    }

    // Update Branch Stats
    await Branch.findByIdAndUpdate(
      effectiveBranchId,
      { $inc: { total_orders: 1 } },
      { session }
    );

    await session.commitTransaction();

    // Populate related fields for response
    const populatedOrder = await Order.findById(order._id).populate([
      "customerId", "branchId", "created_by",
    ]);

    logger.info(`Order created by ${req.user.id}: ${order.order_number}`);

    // Clear analytics cache for affected branch
    analyticsService.clearDashboardCache(effectiveBranchId).catch(err =>
        logger.warn('Failed to clear analytics cache after order creation:', err.message)
    );

    return sendResponse(res, 201, true, "Order created successfully", { order: populatedOrder });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    logger.error("Create order error:", error.message);
    next(error);
  } finally {
    session.endSession();
  }
};

// Get Orders
export const getOrders = async (req, res, next) => {
  try {
    const { status, branchId, customerId, search, page = 1, limit = 10, payment_status } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));

    const query = {};

    // Role-based access control
    if (req.user.role === "customer") {
      query.customerId = req.user.id;
    } else if (req.user.role === "branch_manager") {
      query.branchId = req.user.branchId;
    } else if (req.user.role === "super_admin" && branchId) {
      query.branchId = branchId;
    }

    if (req.user.role !== "customer" && customerId) query.customerId = customerId;
    if (status) query.status = status;
    if (payment_status) query.payment_status = payment_status;

    if (search) {
      const safeSearch = sanitizeForRegex(search);
      query.$or = [
        { order_number: { $regex: safeSearch, $options: "i" } },
        { customer_name: { $regex: safeSearch, $options: "i" } },
      ];
    }

    // Fetch orders and total count in parallel for pagination
    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate(
          req.user.role === "customer"
            ? ["assigned_employee"]
            : ["customerId", "branchId", "assigned_employee"]
        )
        .limit(limitNum)
        .skip((pageNum - 1) * limitNum)
        .sort({ created_at: -1 })
        .lean(), // Optimize read-only query
      Order.countDocuments(query),
    ]);

    return sendResponse(res, 200, true, "Orders retrieved", {
      orders,
      pagination: { total, page: pageNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) {
    next(error);
  }
};

// Get Single Order
export const getOrderById = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate([
      "customerId", 
      "branchId", 
      "assigned_employee", 
      "created_by", 
      "status_history.updated_by",
    ]);

    if (!order) return sendError(res, 404, "Order not found");

    // Permissions Check
    const is_customer_owner =
      req.user.role === "customer" &&
      order.customerId?._id?.toString() === req.user.id;
      
    const is_branch_staff =
      (req.user.role === "branch_manager" || req.user.role === "staff") &&
      order.branchId?._id?.toString() === req.user.branchId?.toString();
      
    const is_super_admin = req.user.role === "super_admin";

    if (!is_customer_owner && !is_branch_staff && !is_super_admin) {
      return sendError(res, 403, "You do not have permission to view this order.");
    }

    return sendResponse(res, 200, true, "Order retrieved", { order });
  } catch (error) {
    next(error);
  }
};

// Mark Order paid 
export const markOrderPaid = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return sendError(res, 404, "Order not found");
    }

    if (order.payment_status === 'paid') {
      await session.abortTransaction();
      return sendResponse(res, 200, true, 'Order already marked paid', { order });
    }

    order.payment_status = 'paid';
    // if order still pending, start processing
    if (order.status === 'pending') order.status = 'processing';
    // revenue recognition logic copied from updateOrder
    const amount = order.total_amount;
    await Branch.findByIdAndUpdate(order.branchId, { $inc: { total_revenue: amount } }, { session });

    await order.save({ session });
    await session.commitTransaction();

    const updated = await Order.findById(orderId).populate(["customerId","branchId","assigned_employee"]);
    return sendResponse(res, 200, true, 'Payment status updated', { order: updated });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Update Order 
export const updateOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.params;
    const updates = req.body;

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return sendError(res, 404, "Order not found");
    }

    const activeStatuses = ["processing", "washing", "drying", "ironing"];
    const isTryingToProcess = updates.status && activeStatuses.includes(updates.status);
    if (isTryingToProcess && order.payment_status !== "paid" && updates.payment_status !== "paid") {
      await session.abortTransaction();
      return sendError(res, 400, "Order must be paid before processing");
    }

    const wasAlreadyPaid = order.payment_status === "paid";
    const oldTotal = order.total_amount;

    // Mark for revenue recognition after recalculation if payment is newly set to paid
    let shouldRecognizeRevenueOnPaid = false;
    if (updates.payment_status === "paid" && !wasAlreadyPaid) {
      shouldRecognizeRevenueOnPaid = true;
      if (order.status === "pending" && !updates.status) {
        updates.status = "processing";
      }
    }

    // Handle Employee Task count adjustments
    if (updates.assigned_employee && order.assigned_employee?.toString() !== updates.assigned_employee) {
      if (order.assigned_employee) {
        await adjustEmployeeAssignedTasks(order.assigned_employee, -1, session);
      }
      if (isValidObjectId(updates.assigned_employee)) {
        await adjustEmployeeAssignedTasks(updates.assigned_employee, 1, session);
      }
    }

    const previousStatus = order.status;

    Object.assign(order, updates);

    if (updates.status && updates.status !== previousStatus) {
      order._updated_by = req.user.id;
    }

    await order.validate();

    // If payment was newly marked paid, recognize revenue using recalculated total
    if (shouldRecognizeRevenueOnPaid) {
      await Branch.findByIdAndUpdate(
        order.branchId,
        { $inc: { total_revenue: order.total_amount } },
        { session }
      );
    }

    // If it was already paid and total changed, adjust branch revenue by the difference
    if (wasAlreadyPaid && order.total_amount !== oldTotal) {
      const difference = order.total_amount - oldTotal;
      await Branch.findByIdAndUpdate(
        order.branchId,
        { $inc: { total_revenue: difference } },
        { session }
      );
    }

    await order.save({ session });
    await session.commitTransaction();

    const updatedOrder = await Order.findById(orderId).populate(["customerId", "branchId", "assigned_employee"]);

    return sendResponse(res, 200, true, "Order updated successfully", { order: updatedOrder });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Update Order Status (With Inventory Deduction)
export const updateOrderStatus = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return sendError(res, 404, "Order not found");
    }

    // Prevent moving from pending if not paid
    const isStartingProcess = ["processing", "washing"].includes(status);
    if (isStartingProcess && order.payment_status !== "paid") {
      await session.abortTransaction();
      return sendError(res, 400, "Order must be paid before processing");
    }

    const oldStatus = order.status;
    if (oldStatus === status) {
        await session.abortTransaction();
        return sendResponse(res, 200, true, `Status is already ${status}`, { order });
    }


    // Inventory Deduction Logic
    try {
      await deductInventoryForTransition(oldStatus, status, order, session, req.user.id);
    } catch (stockError) {
      await session.abortTransaction();
      return sendError(res, stockError.statusCode || 400, stockError.message);
    }

    // Status Update
    order.status = status;
    order._updated_by = req.user.id;

    // Task Tracking
    if (order.assigned_employee && ["ready", "delivered"].includes(status) && !["ready", "delivered"].includes(oldStatus)) {
      await adjustEmployeeAssignedTasks(order.assigned_employee, -1, session);
      await adjustEmployeeCompletedTasks(order.assigned_employee, 1, session);
    }

    // NOTE: Revenue should be recognized on payment, not on status transition to avoid double-counting.

    await order.save({ session });
    await session.commitTransaction();

    logger.info(`Order ${order.order_number} transitioned ${oldStatus} -> ${status} by ${req.user.id}`);

    // Clear analytics cache for affected branch
    analyticsService.clearDashboardCache(order.branchId).catch(err =>
        logger.warn('Failed to clear analytics cache after status update:', err.message)
    );

    const finalOrder = await Order.findById(orderId).populate(["customerId", "branchId", "assigned_employee"]);

    return sendResponse(res, 200, true, `Status changed to ${status}`, { order: finalOrder });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};

// Delete Order
export const deleteOrder = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId).session(session);
    if (!order) {
      await session.abortTransaction();
      return sendError(res, 404, "Order not found");
    }

    // Adjust branch stats if deleting an active order
    if (!["cancelled", "delivered"].includes(order.status)) {
      await Branch.findByIdAndUpdate(
        order.branchId,
        { $inc: { total_orders: -1 } },
        { session }
      );

      if (order.assigned_employee) {
        await adjustEmployeeAssignedTasks(order.assigned_employee, -1, session);
      }
    }

    await Order.findByIdAndDelete(orderId).session(session);
    await session.commitTransaction();

    logger.info(`Order ${orderId} deleted by ${req.user.id}`);
    return sendResponse(res, 200, true, "Order deleted successfully");
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
};