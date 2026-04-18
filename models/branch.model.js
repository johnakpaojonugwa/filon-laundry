import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        street: {
            type: String,
            required: true,
            trim: true
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        state: {
            type: String,
            required: true,
            trim: true
        },
        zip: {
            type: String,
            required: true,
            trim: true
        }
    },
    email: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        lowercase: true
    },
    contact_number: {
        type: String,
        match: [/^\+?[0-9]{7,15}$/, "Invalid phone number"]
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        required: false
    },
    is_active: {
        type: Boolean,
        default: true,
    },
    operating_hours: {
        type: String,
    },
    total_orders: {
        type: Number,
        default: 0
    },
    total_revenue: {
        type: Number,
        default: 0
    },
    branch_code: {
        type: String,
        required: function () {
            return !this.name;
        },
        unique: true,
        uppercase: true,
        trim: true,
        description: "e.g., NY-01, LON-SHP"
    },
    services_offered: [{
        type: String,
        enum: ['wash_fold', 'dry_cleaning', 'stain_removal', 'pickup', 'delivery', 'express', 'alterations' ],
    }],

}, { timestamps: true });

branchSchema.pre('validate', function () {
    if (!this.branch_code && this.name) {
        this.branch_code = this.name.substring(0, 3).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);
    }
});

const Branch = mongoose.model('Branch', branchSchema);

export default Branch;