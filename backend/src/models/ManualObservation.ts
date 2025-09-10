import mongoose, { Schema, Document } from 'mongoose';

// Manual Observation interface
export interface ManualObservation {
  observationId: string;
  sessionId: string;
  interviewerId: string;
  timestamp: Date;
  observationType: 'suspicious_behavior' | 'technical_issue' | 'general_note' | 'violation';
  description: string;
  severity: 'low' | 'medium' | 'high';
  flagged: boolean;
}

// Extend the interface to include MongoDB document properties
export interface ManualObservationDocument extends ManualObservation, Document {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Manual Observation Schema
const ManualObservationSchema = new Schema<ManualObservationDocument>({
  observationId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true,
    validate: {
      validator: function(v: string) {
        // UUID v4 validation regex
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'observationId must be a valid UUID'
    }
  },
  sessionId: { 
    type: String, 
    required: true,
    index: true,
    ref: 'InterviewSession',
    validate: {
      validator: function(v: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'sessionId must be a valid UUID'
    }
  },
  interviewerId: { 
    type: String, 
    required: true,
    index: true,
    ref: 'User',
    validate: {
      validator: function(v: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'interviewerId must be a valid UUID'
    }
  },
  timestamp: { 
    type: Date, 
    required: true,
    index: true
  },
  observationType: {
    type: String,
    enum: ['suspicious_behavior', 'technical_issue', 'general_note', 'violation'],
    required: true,
    index: true
  },
  description: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 1000
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high'],
    required: true,
    index: true
  },
  flagged: {
    type: Boolean,
    required: true,
    default: false,
    index: true
  }
}, {
  timestamps: true,
  collection: 'manual_observations'
});

// Indexes for efficient queries
ManualObservationSchema.index({ sessionId: 1, timestamp: -1 });
ManualObservationSchema.index({ interviewerId: 1, timestamp: -1 });
ManualObservationSchema.index({ observationType: 1, severity: 1 });
ManualObservationSchema.index({ flagged: 1, timestamp: -1 });

// Instance methods
ManualObservationSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

ManualObservationSchema.methods.flag = function() {
  this.flagged = true;
  return this.save();
};

ManualObservationSchema.methods.unflag = function() {
  this.flagged = false;
  return this.save();
};

// Static methods
ManualObservationSchema.statics.findBySession = function(sessionId: string) {
  return this.find({ sessionId }).sort({ timestamp: -1 });
};

ManualObservationSchema.statics.findByInterviewer = function(interviewerId: string) {
  return this.find({ interviewerId }).sort({ timestamp: -1 });
};

ManualObservationSchema.statics.findFlagged = function(sessionId?: string) {
  const query = { flagged: true };
  if (sessionId) {
    (query as any).sessionId = sessionId;
  }
  return this.find(query).sort({ timestamp: -1 });
};

ManualObservationSchema.statics.getObservationSummary = function(sessionId: string) {
  return this.aggregate([
    { $match: { sessionId } },
    {
      $group: {
        _id: {
          observationType: '$observationType',
          severity: '$severity'
        },
        count: { $sum: 1 },
        flaggedCount: { 
          $sum: { $cond: ['$flagged', 1, 0] } 
        }
      }
    }
  ]);
};

// Add interface for static methods
interface ManualObservationModel extends mongoose.Model<ManualObservationDocument> {
  findBySession(sessionId: string): mongoose.Query<ManualObservationDocument[], ManualObservationDocument>;
  findByInterviewer(interviewerId: string): mongoose.Query<ManualObservationDocument[], ManualObservationDocument>;
  findFlagged(sessionId?: string): mongoose.Query<ManualObservationDocument[], ManualObservationDocument>;
  getObservationSummary(sessionId: string): mongoose.Aggregate<any[]>;
}

// Create and export the model
export const ManualObservation = mongoose.model<ManualObservationDocument, ManualObservationModel>('ManualObservation', ManualObservationSchema);