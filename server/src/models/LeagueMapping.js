import mongoose from 'mongoose';

const leagueMappingSchema = new mongoose.Schema({
    unibetId: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    unibetName: {
        type: String,
        required: true
    },
    fotmobId: {
        type: Number,
        required: true
        // ✅ REMOVED: index: true - We create index manually with schema.index() to control uniqueness
        // ✅ REMOVED: unique: true - Allow multiple Unibet IDs to map to one Fotmob ID
        // ✅ This stores primaryId (e.g., 8968 for Primera Federacion groups)
    },
    fotmobGroupId: {
        type: Number,
        required: false,
        index: false
        // ✅ Optional - Only for group leagues (e.g., 901480 for Group 1, 901481 for Group 2)
        // ✅ Used to distinguish between different groups sharing the same primaryId
    },
    fotmobName: {
        type: String,
        required: true
    },
    matchType: {
        type: String,
        enum: ['Exact Match', 'Different Name'],
        required: true
    },
    country: {
        type: String,
        default: ''
    },
    unibetUrl: {
        type: String,
        default: ''
    },
    fotmobUrl: {
        type: String,
        default: ''
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update timestamp on save
leagueMappingSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// Compound index (non-unique) to support multiple unibetIds per fotmobId
leagueMappingSchema.index({ unibetId: 1, fotmobId: 1 }, { unique: false });
// Index for querying by fotmobId (for finding all unibetIds mapped to a fotmobId)
// ✅ IMPORTANT: fotmobId is NON-UNIQUE to allow multiple Unibet leagues to map to same Fotmob league
leagueMappingSchema.index({ fotmobId: 1 }, { unique: false });

const LeagueMapping = mongoose.model('LeagueMapping', leagueMappingSchema);

export default LeagueMapping;
