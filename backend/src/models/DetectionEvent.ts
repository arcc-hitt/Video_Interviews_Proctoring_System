import mongoose, { Schema, Document } from 'mongoose';
import { DetectionEvent as IDetectionEvent, EventType, UnauthorizedItemType } from '../types';

// Extend the interface to include MongoDB document properties
export interface DetectionEventDocument extends IDetectionEvent, Document {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Bounding Box Schema
const BoundingBoxSchema = new Schema({
  x: { type: Number, required: true, min: 0 },
  y: { type: Number, required: true, min: 0 },
  width: { type: Number, required: true, min: 0 },
  height: { type: Number, required: true, min: 0 }
}, { _id: false });

// Gaze Direction Schema
const GazeDirectionSchema = new Schema({
  x: { type: Number, required: true, min: -1, max: 1 },
  y: { type: Number, required: true, min: -1, max: 1 }
}, { _id: false });

// Eye Metrics Schema
const EyeMetricsSchema = new Schema({
  leftEyeAR: { type: Number, required: true, min: 0, max: 1 },
  rightEyeAR: { type: Number, required: true, min: 0, max: 1 },
  averageEyeAR: { type: Number, required: true, min: 0, max: 1 },
  isEyesClosed: { type: Boolean, required: true },
  blinkDuration: { type: Number, required: true, min: 0 }
}, { _id: false });

// Drowsiness Metrics Schema
const DrowsinessMetricsSchema = new Schema({
  blinkRate: { type: Number, required: true, min: 0 },
  averageBlinkDuration: { type: Number, required: true, min: 0 },
  longBlinkCount: { type: Number, required: true, min: 0 },
  drowsinessScore: { type: Number, required: true, min: 0, max: 1 },
  isAwake: { type: Boolean, required: true }
}, { _id: false });

// Speech Segment Schema
const SpeechSegmentSchema = new Schema({
  startTime: { type: Number, required: true, min: 0 },
  endTime: { type: Number, required: true, min: 0 },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  isCandidateVoice: { type: Boolean, required: true }
}, { _id: false });

// Audio Metrics Schema
const AudioMetricsSchema = new Schema({
  volume: { type: Number, required: true, min: 0, max: 1 },
  frequency: { type: Number, required: true, min: 0 },
  voiceActivityProbability: { type: Number, required: true, min: 0, max: 1 },
  backgroundNoiseLevel: { type: Number, required: true, min: 0, max: 1 },
  speechSegments: { type: [SpeechSegmentSchema], required: true }
}, { _id: false });

// Detection Event Metadata Schema
const DetectionEventMetadataSchema = new Schema({
  gazeDirection: { type: GazeDirectionSchema, required: false },
  objectType: { 
    type: String, 
    enum: Object.values(UnauthorizedItemType),
    required: false 
  },
  boundingBox: { type: BoundingBoxSchema, required: false },
  faceCount: { type: Number, min: 0, required: false },
  eyeMetrics: { type: EyeMetricsSchema, required: false },
  drowsinessMetrics: { type: DrowsinessMetricsSchema, required: false },
  audioMetrics: { type: AudioMetricsSchema, required: false },
  description: { type: String, required: false }
}, { _id: false });

// Main Detection Event Schema
const DetectionEventSchema = new Schema<DetectionEventDocument>({
  sessionId: { 
    type: String, 
    required: true,
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
    validate: {
      validator: function(v: string) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
      },
      message: 'candidateId must be a valid UUID'
    }
  },
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
  confidence: { 
    type: Number, 
    required: true, 
    min: 0, 
    max: 1 
  },
  metadata: { 
    type: DetectionEventMetadataSchema, 
    required: true 
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  collection: 'detection_events'
});

// Compound indexes for efficient queries
DetectionEventSchema.index({ sessionId: 1, timestamp: -1 });
DetectionEventSchema.index({ candidateId: 1, eventType: 1 });
DetectionEventSchema.index({ timestamp: -1, eventType: 1 });

// Instance methods
DetectionEventSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

// Static methods
DetectionEventSchema.statics.findBySession = function(sessionId: string) {
  return this.find({ sessionId }).sort({ timestamp: -1 });
};

DetectionEventSchema.statics.findByCandidate = function(candidateId: string) {
  return this.find({ candidateId }).sort({ timestamp: -1 });
};

DetectionEventSchema.statics.findByEventType = function(eventType: EventType) {
  return this.find({ eventType }).sort({ timestamp: -1 });
};

DetectionEventSchema.statics.getEventSummary = function(sessionId: string) {
  return this.aggregate([
    { $match: { sessionId } },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
        avgConfidence: { $avg: '$confidence' },
        firstOccurrence: { $min: '$timestamp' },
        lastOccurrence: { $max: '$timestamp' }
      }
    }
  ]);
};

// Add interface for static methods
interface DetectionEventModel extends mongoose.Model<DetectionEventDocument> {
  findBySession(sessionId: string): mongoose.Query<DetectionEventDocument[], DetectionEventDocument>;
  findByCandidate(candidateId: string): mongoose.Query<DetectionEventDocument[], DetectionEventDocument>;
  findByEventType(eventType: EventType): mongoose.Query<DetectionEventDocument[], DetectionEventDocument>;
  getEventSummary(sessionId: string): mongoose.Aggregate<any[]>;
}

// Create and export the model
export const DetectionEvent = mongoose.model<DetectionEventDocument, DetectionEventModel>('DetectionEvent', DetectionEventSchema);