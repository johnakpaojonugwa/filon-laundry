import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

const UserSchema = new mongoose.Schema({
    fullname: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    phone_number: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        match: [/^\+?[0-9]{7,15}$/, "Invalid phone number"]
    },
    password: {
        type: String,
        required: true,
        select: false
    },
    address: {
        type: String,
        trim: true
    },
    role: {
        type: String,
        enum: ['customer', 'staff', 'branch_manager', 'super_admin'],
        default: 'customer'
    },
    designation: {
        type: String,
        trim: true
    },
    department: {
        type: String,
        trim: true
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: function () {
            return this.role !== 'customer';
        }
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    avatar: String,
    last_login: Date,
    password_reset_token: String,
    password_reset_expires: Date,
    refresh_tokens: [
        {
            token: { type: String },
            created_at: { type: Date, default: Date.now },
            expires_at: { type: Date }
        }
    ]
}, { timestamps: true });

// Indexes
UserSchema.index({ password_reset_token: 1 });
UserSchema.index({ branchId: 1, role: 1 });
UserSchema.index({ 'refresh_tokens.token': 1 });

// Hash password before saving
UserSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
});

// Instance method to compare passwords
UserSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcryptjs.compare(candidatePassword, this.password);
};

// Remove sensitive data from responses
UserSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    delete obj.password_reset_token;
    delete obj.password_reset_expires;
    delete obj.refresh_tokens;
    delete obj.__v; // Remove version key
    return obj;
};

const User = mongoose.model('User', UserSchema);

export default User;