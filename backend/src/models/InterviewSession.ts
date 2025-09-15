import mongoose, { Schema, Document } from 'mongoose';
import { InterviewSession as IInterviewSession, SessionStatus } from '../types';

// Extend the interface to include MongoDB document properties
export interface InterviewSessionDocument extends IInterviewSession, Document {
  _id: mongoose.Types.ObjectId;
  candidateEmail?: string; // Add this field to the document interface
  interviewerId?: string;
  recordingPublicId?: string;
  recordingUploadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // instance methods
  calculateDuration: () => number;
  endSession: () => Promise<InterviewSessionDocument>;
  terminateSession: () => Promise<InterviewSessionDocument>;
}

// Interview Session Schema
const InterviewSessionSchema = new Schema<InterviewSessionDocument>({
  interviewerId: {
    type: String,
    required: false,
    index: true,
    validate: {
      validator: function(v: string) {
        if (!v) return true;
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'interviewerId must be a valid UUID'
    }
  },
  sessionId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true,
    validate: {
      validator: function(v: string) {
        // UUID v4 validation regex
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'sessionId must be a valid UUID'
    }
  },
  candidateId: { 
    type: String, 
    required: true,
    index: true,
    validate: {
      validator: function(v: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'candidateId must be a valid UUID'
    }
  },
  candidateName: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  candidateEmail: { 
    type: String, 
    required: false,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v: string) {
        if (!v) return true; // Optional field
        // Basic email validation
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'candidateEmail must be a valid email address'
    }
  },
  startTime: { 
    type: Date, 
    required: true,
    index: true
  },
  endTime: { 
    type: Date,
    required: false,
    validate: {
      validator: function(this: InterviewSessionDocument, endTime: Date) {
        // End time must be after start time
        return !endTime || endTime > this.startTime;
      },
      message: 'End time must be after start time'
    }
  },
  duration: { 
    type: Number,
    min: 0,
    required: false
  },
  videoUrl: { 
    type: String,
    required: false,
    validate: {
      validator: function(v: string) {
        if (!v) return true; // Optional field
        // Accept absolute URLs and known relative API paths
        if (v.startsWith('http://') || v.startsWith('https://')) return true;
        // Allow relative paths for locally stored recordings
        if (v.startsWith('/')) return true;
        return false;
      },
      message: 'videoUrl must be a valid URL'
    }
  },
  // Cloud storage metadata for recording
  recordingPublicId: {
    type: String,
    required: false,
    index: true
  },
  recordingUploadedAt: {
    type: Date,
    required: false
  },
  status: {
    type: String,
    enum: Object.values(SessionStatus),
    default: SessionStatus.ACTIVE,
    index: true
  }
}, {
  timestamps: true,
  collection: 'interview_sessions'
});

// Indexes for efficient queries
InterviewSessionSchema.index({ candidateId: 1, startTime: -1 });
InterviewSessionSchema.index({ status: 1, startTime: -1 });
InterviewSessionSchema.index({ startTime: -1 });

// Pre-save middleware to calculate duration
InterviewSessionSchema.pre('save', function(this: InterviewSessionDocument, next) {
  if (this.endTime && this.startTime) {
    this.duration = Math.floor((this.endTime.getTime() - this.startTime.getTime()) / 1000);
  }
  next();
});

// Instance methods
InterviewSessionSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

InterviewSessionSchema.methods.calculateDuration = function(this: InterviewSessionDocument): number {
  if (this.endTime) {
    return Math.floor((this.endTime.getTime() - this.startTime.getTime()) / 1000);
  }
  // If session is still active, calculate current duration
  return Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);
};

InterviewSessionSchema.methods.endSession = function(this: InterviewSessionDocument) {
  this.endTime = new Date();
  this.status = SessionStatus.COMPLETED;
  this.duration = this.calculateDuration();
  return this.save();
};

InterviewSessionSchema.methods.terminateSession = function(this: InterviewSessionDocument) {
  this.endTime = new Date();
  this.status = SessionStatus.TERMINATED;
  this.duration = this.calculateDuration();
  return this.save();
};

// Static methods
InterviewSessionSchema.statics.findActiveSession = function(candidateId: string) {
  return this.findOne({ 
    candidateId, 
    status: SessionStatus.ACTIVE 
  });
};

InterviewSessionSchema.statics.findByCandidate = function(candidateId: string) {
  return this.find({ candidateId }).sort({ startTime: -1 });
};

InterviewSessionSchema.statics.findByStatus = function(status: SessionStatus) {
  return this.find({ status }).sort({ startTime: -1 });
};

InterviewSessionSchema.statics.getSessionStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgDuration: { $avg: '$duration' },
        totalDuration: { $sum: '$duration' }
      }
    }
  ]);
};

// Create and export the model
export const InterviewSession = mongoose.model<InterviewSessionDocument>('InterviewSession', InterviewSessionSchema);