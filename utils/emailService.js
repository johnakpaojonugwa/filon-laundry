import { BrevoClient } from '@getbrevo/brevo';
import { logger } from './logger.js';

// Initialize the API instance using the namespace
const brevo = new BrevoClient({ 
    apiKey: process.env.BREVO_API_KEY,
    timeoutInSeconds: 30
});

const defaultFromEmail = process.env.EMAIL_FROM || 'no-reply@filonlaundry.com';
const defaultFromName = 'Filon Laundry';

/**
 * Core sendEmail function refactored for Brevo
 */
const sendEmail = async ({ to, subject, html, text, from }) => {
    try {
        const result = await brevo.transactionalEmails.sendTransacEmail({
            subject: subject,
            htmlContent: html,
            textContent: text || (html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : undefined),
            sender: { name: defaultFromName, email: from || defaultFromEmail },
            to: [{ email: to }]
        });

        logger.info(`Email sent to ${to} (${subject})`, { messageId: result.messageId });
        return true;
    } catch (error) {
        // Modern SDK errors are usually more descriptive
        const errMsg = error.message || 'Unknown Brevo error';
        logger.error(`Brevo email error for ${to}:`, errMsg);
        return false;
    }
};

export const emailService = {
    /**
     * Send welcome email
     */
    sendWelcomeEmail: async (user) => {
        const htmlTemplate = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; }
                    .container { max-width: 600px; margin: 0 auto; }
                    .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
                    .content { padding: 20px; }
                    .footer { background-color: #f0f0f0; padding: 10px; text-align: center; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to Filon Laundry! 🧹</h1>
                    </div>
                    <div class="content">
                        <p>Hi ${user.fullname},</p>
                        <p>Your account has been successfully created. You can now log in and start managing your laundry orders.</p>
                        <p><strong>Your Account Details:</strong></p>
                        <ul>
                            <li>Email: ${user.email}</li>
                            <li>Role: ${user.role}</li>
                        </ul>
                        <p>Keep your password safe and never share it with anyone.</p>
                        <p>Best regards,<br>The Filon Laundry Team</p>
                    </div>
                    <div class="footer">
                        <p>&copy; 2026 Filon Management System. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return await sendEmail({
            to: user.email,
            subject: 'Welcome to Filon Laundry - Your Account is Ready!',
            html: htmlTemplate
        });
    },

    /**
     * Send low-stock alert email
     */
    sendLowStockAlert: async (items, email) => {
        const itemsList = items.map(item => `
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.item_name}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.current_stock} ${item.unit}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.reorder_level} ${item.unit}</td>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.branch?.name || 'N/A'}</td>
            </tr>
        `).join('');

        const htmlTemplate = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    table { border-collapse: collapse; width: 100%; }
                    th { background-color: #ff6b6b; color: white; padding: 10px; text-align: left; }
                </style>
            </head>
            <body>
                <div style="max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ff6b6b;">⚠️ Low Stock Alert</h2>
                    <p>The following items are running low on stock:</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Item Name</th>
                                <th>Current Stock</th>
                                <th>Reorder Level</th>
                                <th>Branch</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsList}
                        </tbody>
                    </table>
                    <p>Please reorder these items as soon as possible.</p>
                </div>
            </body>
            </html>
        `;

        return await sendEmail({
            to: email,
            subject: '⚠️ Low Stock Alert - Action Required',
            html: htmlTemplate
        });
    },

    /**
     * Send order status update email
     */
    sendOrderStatusEmail: async (order, user) => {
        const statusEmojis = {
            'received': '📦',
            'washing': '🧼',
            'drying': '🌬️',
            'ready': '✅',
            'delivered': '🚚',
            'cancelled': '❌'
        };

        const htmlTemplate = `
            <!DOCTYPE html>
            <html>
            <body>
                <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                    <h2>${statusEmojis[order.status] || '📦'} Order Status Update</h2>
                    <p>Hi ${user.fullname},</p>
                    <p>Your order <strong>#${order.order_number}</strong> status has been updated.</p>
                    <p><strong>Current Status:</strong> ${order.status}</p>
                    <p><strong>Total Amount:</strong> $${order.total_amount}</p>
                    <p><strong>Items:</strong></p>
                    <ul>
                        ${order.items.map(item => `<li>${item.service_name} x ${item.quantity}</li>`).join('')}
                    </ul>
                    <p>Thank you for your business!</p>
                </div>
            </body>
            </html>
        `;

        return await sendEmail({
            to: user.email,
            subject: `Order #${order.order_number} - ${order.status}`,
            html: htmlTemplate
        });
    },

    /**
     * Send password reset email
     */
    sendPasswordResetEmail: async (user, resetToken) => {
        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

        const htmlTemplate = `
            <!DOCTYPE html>
            <html>
            <body>
                <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
                    <h2>Password Reset Request</h2>
                    <p>Hi ${user.fullname},</p>
                    <p>We received a request to reset your password. Click the link below to proceed:</p>
                    <p>
                        <a href="${resetLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
                            Reset Password
                        </a>
                    </p>
                    <p>This link expires in 1 hour.</p>
                    <p>If you didn't request this, ignore this email.</p>
                </div>
            </body>
            </html>
        `;

        return await sendEmail({
            to: user.email,
            subject: 'Password Reset Request',
            html: htmlTemplate
        });
    }
};