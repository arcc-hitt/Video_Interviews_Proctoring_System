import mongoose, { Schema, Document } from 'mongoose';
import { ProctoringReport as IProctoringReport, SuspiciousEvent, EventType } from '../types';

// Extend the interface to include MongoDB document properties
export interface ProctoringReportDocument extends IProctoringReport, Document {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Suspicious Event Schema
const SuspiciousEventSchema = new Schema({
  eventType: {
    type: String,
    enum: Object.values(EventType),
    required: true
  },
  timestamp: { 
    type: Date, 
    required: true 
  },
  duration: { 
    type: Number, 
    min: 0,
    required: false 
  },
  description: { 
    type: String, 
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 500
  }
}, { _id: false });

// Proctoring Report Schema
const ProctoringReportSchema = new Schema<ProctoringReportDocument>({
  reportId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true,
    validate: {
      validator: function(v: string) {
        // UUID v4 validation regex
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'reportId must be a valid UUID'
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
  interviewDuration: { 
    type: Number, 
    required: true,
    min: 0
  },
  focusLossCount: { 
    type: Number, 
    required: true,
    min: 0,
    default: 0
  },
  absenceCount: { 
    type: Number, 
    required: true,
    min: 0,
    default: 0
  },
  multipleFacesCount: { 
    type: Number, 
    required: true,
    min: 0,
    default: 0
  },
  unauthorizedItemsCount: { 
    type: Number, 
    required: true,
    min: 0,
    default: 0
  },
  integrityScore: { 
    type: Number, 
    required: true,
    max: 100
  },
  suspiciousEvents: {
    type: [SuspiciousEventSchema],
    default: []
  },
  generatedAt: { 
    type: Date, 
    required: true,
    default: Date.now,
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  // Cloudinary storage URLs for generated reports
  cloudinaryPdfUrl: {
    type: String,
    required: false,
    validate: {
      validator: function(v: string) {
        return !v || /^https?:\/\/.*/.test(v);
      },
      message: 'cloudinaryPdfUrl must be a valid URL'
    }
  },
  cloudinaryPdfPublicId: {
    type: String,
    required: false
  },
  cloudinaryCsvUrl: {
    type: String,
    required: false,
    validate: {
      validator: function(v: string) {
        return !v || /^https?:\/\/.*/.test(v);
      },
      message: 'cloudinaryCsvUrl must be a valid URL'
    }
  },
  cloudinaryCsvPublicId: {
    type: String,
    required: false
  }
}, {
  timestamps: true,
  collection: 'proctoring_reports'
});

// Indexes for efficient queries
ProctoringReportSchema.index({ candidateId: 1, generatedAt: -1 });
// Removed duplicate simple index on sessionId since the field already uses index: true
ProctoringReportSchema.index({ integrityScore: 1 });
ProctoringReportSchema.index({ generatedAt: -1 });

// Pre-save middleware to calculate integrity score if not provided
ProctoringReportSchema.pre('save', function(next) {
  if (!this.integrityScore) {
    // Calculate integrity score inline
    let score = 100;
    score -= this.focusLossCount * 2;
    score -= this.absenceCount * 5;
    score -= this.multipleFacesCount * 10;
    score -= this.unauthorizedItemsCount * 15;
    this.integrityScore = score; // Allow negative scores
  }
  next();
});

// Instance methods
ProctoringReportSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

ProctoringReportSchema.methods.calculateIntegrityScore = function(): number {
  let score = 100;
  
  // Deduct points based on violations
  // Focus loss: -2 points per incident
  score -= this.focusLossCount * 2;
  
  // Absence: -5 points per incident
  score -= this.absenceCount * 5;
  
  // Multiple faces: -10 points per incident
  score -= this.multipleFacesCount * 10;
  
  // Unauthorized items: -15 points per incident
  score -= this.unauthorizedItemsCount * 15;
  
  // Allow negative scores to reflect severe violations
  return score;
};

ProctoringReportSchema.methods.addSuspiciousEvent = function(event: SuspiciousEvent) {
  this.suspiciousEvents.push(event);
  
  // Update counters based on event type
  switch (event.eventType) {
    case EventType.FOCUS_LOSS:
      this.focusLossCount += 1;
      break;
    case EventType.ABSENCE:
      this.absenceCount += 1;
      break;
    case EventType.MULTIPLE_FACES:
      this.multipleFacesCount += 1;
      break;
    case EventType.UNAUTHORIZED_ITEM:
      this.unauthorizedItemsCount += 1;
      break;
  }
  
  // Recalculate integrity score
  this.integrityScore = this.calculateIntegrityScore();
};

ProctoringReportSchema.methods.getViolationSummary = function() {
  return {
    totalViolations: this.focusLossCount + this.absenceCount + this.multipleFacesCount + this.unauthorizedItemsCount,
    focusLossCount: this.focusLossCount,
    absenceCount: this.absenceCount,
    multipleFacesCount: this.multipleFacesCount,
    unauthorizedItemsCount: this.unauthorizedItemsCount,
    integrityScore: this.integrityScore
  };
};

// Static methods
ProctoringReportSchema.statics.findByCandidate = function(candidateId: string) {
  return this.find({ candidateId }).sort({ generatedAt: -1 });
};

ProctoringReportSchema.statics.findBySession = function(sessionId: string) {
  return this.findOne({ sessionId });
};

ProctoringReportSchema.statics.findByIntegrityRange = function(minScore: number, maxScore: number) {
  return this.find({ 
    integrityScore: { $gte: minScore, $lte: maxScore } 
  }).sort({ integrityScore: -1 });
};

ProctoringReportSchema.statics.getReportStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalReports: { $sum: 1 },
        avgIntegrityScore: { $avg: '$integrityScore' },
        avgFocusLoss: { $avg: '$focusLossCount' },
        avgAbsence: { $avg: '$absenceCount' },
        avgMultipleFaces: { $avg: '$multipleFacesCount' },
        avgUnauthorizedItems: { $avg: '$unauthorizedItemsCount' },
        highIntegrityReports: {
          $sum: { $cond: [{ $gte: ['$integrityScore', 80] }, 1, 0] }
        },
        lowIntegrityReports: {
          $sum: { $cond: [{ $lt: ['$integrityScore', 60] }, 1, 0] }
        }
      }
    }
  ]);
};

// Create and export the model
export const ProctoringReport = mongoose.model<ProctoringReportDocument>('ProctoringReport', ProctoringReportSchema);