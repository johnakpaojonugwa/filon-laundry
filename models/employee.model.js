import mongoose from 'mongoose';
import { customAlphabet } from 'nanoid';

// Generate a unique employee ID using nanoid
const nanoid = customAlphabet("1234567890", 6);

const employeeSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    // Personal Information
    date_of_birth: Date,
    gender: { type: String, enum: ['male', 'female'] },
    phone_number: String,
    address: String,
    city: String,
    state: String,
    zip: String,
    country: String,

    employee_number: {
        type: String,
        unique: true,
        default: () => `EMP-${new Date().getFullYear()}-${nanoid()}`,
    },
    designation: {
        type: String,
        required: true,
        enum: ['branch_manager', 'supervisor', 'washer', 'ironer', 'driver', 'receptionist', 'cleaner'],
        default: 'washer'
    },
    department: {
        type: String,
        required: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'terminated', 'suspended'],
        default: 'active'
    },
    avatar: String,
    assigned_tasks: {
        type: Number,
        default: 0
    },
    completed_tasks: {
        type: Number,
        default: 0
    },
    performance_rating: {
        type: Number,
        default: 0,
    },
    employment_history: [{
        position: String,
        department: String,
        join_date: Date,
        end_date: Date,
        description: String
    }],
    reporting_managerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
    },
    termination_date: Date,
    termination_reason: String,
    exit_notes: String,

}, { 
    timestamps: true, 
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Index for faster queries
employeeSchema.index({ branchId: 1, role: 1 });
employeeSchema.index({ status: 1 });
employeeSchema.index({ reporting_managerId: 1 });

const Employee = mongoose.model('Employee', employeeSchema);

export default Employee;