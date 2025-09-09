import { v4 as uuidv4 } from 'uuid';
import { DetectionEvent, InterviewSession, ProctoringReport } from '../models';
import { EventType, SessionStatus, UnauthorizedItemType } from '../types';
import { connectToDatabase, disconnectFromDatabase } from './database';

/**
 * Generate sample detection events for a session
 */
function generateSampleDetectionEvents(sessionId: string, candidateId: string, count: number = 10) {
  const events = [];
  const startTime = new Date(Date.now() - 3600000); // 1 hour ago
  
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(startTime.getTime() + (i * 300000)); // 5 minutes apart
    const eventTypes = Object.values(EventType);
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    
    let metadata: any = {};
    
    switch (eventType) {
      case EventType.FOCUS_LOSS:
        metadata = {
          gazeDirection: {
            x: Math.random() * 2 - 1, // -1 to 1
            y: Math.random() * 2 - 1
          }
        };
        break;
      case EventType.ABSENCE:
        metadata = {
          faceCount: 0
        };
        break;
      case EventType.MULTIPLE_FACES:
        metadata = {
          faceCount: Math.floor(Math.random() * 3) + 2 // 2-4 faces
        };
        break;
      case EventType.UNAUTHORIZED_ITEM:
        const itemTypes = Object.values(UnauthorizedItemType);
        metadata = {
          objectType: itemTypes[Math.floor(Math.random() * itemTypes.length)],
          boundingBox: {
            x: Math.floor(Math.random() * 400),
            y: Math.floor(Math.random() * 300),
            width: Math.floor(Math.random() * 200) + 50,
            height: Math.floor(Math.random() * 200) + 50
          }
        };
        break;
    }
    
    events.push({
      sessionId,
      candidateId,
      eventType,
      timestamp,
      duration: eventType === EventType.FOCUS_LOSS || eventType === EventType.ABSENCE 
        ? Math.floor(Math.random() * 30) + 5 // 5-35 seconds
        : undefined,
      confidence: Math.random() * 0.3 + 0.7, // 0.7-1.0
      metadata
    });
  }
  
  return events;
}

/**
 * Generate sample interview sessions
 */
function generateSampleSessions(count: number = 5) {
  const sessions = [];
  const candidateNames = [
    'John Doe',
    'Jane Smith',
    'Alice Johnson',
    'Bob Wilson',
    'Carol Brown',
    'David Lee',
    'Emma Davis',
    'Frank Miller'
  ];
  
  for (let i = 0; i < count; i++) {
    const sessionId = uuidv4();
    const candidateId = uuidv4();
    const candidateName = candidateNames[Math.floor(Math.random() * candidateNames.length)];
    const startTime = new Date(Date.now() - Math.random() * 7 * 24 * 3600000); // Random time in last week
    const duration = Math.floor(Math.random() * 3600) + 1800; // 30 minutes to 90 minutes
    const endTime = new Date(startTime.getTime() + duration * 1000);
    
    const statuses = Object.values(SessionStatus);
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    
    sessions.push({
      sessionId,
      candidateId,
      candidateName,
      startTime,
      endTime: status !== SessionStatus.ACTIVE ? endTime : undefined,
      duration: status !== SessionStatus.ACTIVE ? duration : undefined,
      videoUrl: `https://example.com/videos/${sessionId}.mp4`,
      status
    });
  }
  
  return sessions;
}

/**
 * Generate sample proctoring reports
 */
function generateSampleReports(sessions: any[]) {
  return sessions
    .filter(session => session.status === SessionStatus.COMPLETED)
    .map(session => {
      const focusLossCount = Math.floor(Math.random() * 5);
      const absenceCount = Math.floor(Math.random() * 3);
      const multipleFacesCount = Math.floor(Math.random() * 2);
      const unauthorizedItemsCount = Math.floor(Math.random() * 3);
      
      // Calculate integrity score
      let integrityScore = 100;
      integrityScore -= focusLossCount * 2;
      integrityScore -= absenceCount * 5;
      integrityScore -= multipleFacesCount * 10;
      integrityScore -= unauthorizedItemsCount * 15;
      integrityScore = Math.max(0, integrityScore);
      
      // Generate suspicious events
      const suspiciousEvents = [];
      const eventTypes = Object.values(EventType);
      
      for (let i = 0; i < focusLossCount + absenceCount + multipleFacesCount + unauthorizedItemsCount; i++) {
        const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
        const timestamp = new Date(session.startTime.getTime() + Math.random() * session.duration * 1000);
        
        let description = '';
        switch (eventType) {
          case EventType.FOCUS_LOSS:
            description = 'Candidate looked away from screen for extended period';
            break;
          case EventType.ABSENCE:
            description = 'Candidate was absent from camera view';
            break;
          case EventType.MULTIPLE_FACES:
            description = 'Multiple faces detected in camera view';
            break;
          case EventType.UNAUTHORIZED_ITEM:
            description = 'Unauthorized item detected in camera view';
            break;
        }
        
        suspiciousEvents.push({
          eventType,
          timestamp,
          duration: Math.floor(Math.random() * 30) + 5,
          description
        });
      }
      
      return {
        reportId: uuidv4(),
        sessionId: session.sessionId,
        candidateId: session.candidateId,
        candidateName: session.candidateName,
        interviewDuration: session.duration,
        focusLossCount,
        absenceCount,
        multipleFacesCount,
        unauthorizedItemsCount,
        integrityScore,
        suspiciousEvents,
        generatedAt: new Date(session.endTime.getTime() + 300000) // 5 minutes after session end
      };
    });
}

/**
 * Seed the database with sample data
 */
export async function seedDatabase(): Promise<void> {
  try {
    console.log('Starting database seeding...');
    
    // Connect to database
    await connectToDatabase();
    
    // Clear existing data
    console.log('Clearing existing data...');
    await DetectionEvent.deleteMany({});
    await InterviewSession.deleteMany({});
    await ProctoringReport.deleteMany({});
    
    // Generate sample data
    console.log('Generating sample data...');
    const sessions = generateSampleSessions(10);
    const reports = generateSampleReports(sessions);
    
    // Insert sessions
    console.log('Inserting interview sessions...');
    const insertedSessions = await InterviewSession.insertMany(sessions);
    console.log(`Inserted ${insertedSessions.length} interview sessions`);
    
    // Generate and insert detection events for each session
    console.log('Inserting detection events...');
    let totalEvents = 0;
    for (const session of insertedSessions) {
      const events = generateSampleDetectionEvents(
        session.sessionId, 
        session.candidateId, 
        Math.floor(Math.random() * 20) + 5 // 5-25 events per session
      );
      await DetectionEvent.insertMany(events);
      totalEvents += events.length;
    }
    console.log(`Inserted ${totalEvents} detection events`);
    
    // Insert reports
    console.log('Inserting proctoring reports...');
    const insertedReports = await ProctoringReport.insertMany(reports);
    console.log(`Inserted ${insertedReports.length} proctoring reports`);
    
    console.log('Database seeding completed successfully!');
    
    // Print summary
    console.log('\n=== SEEDING SUMMARY ===');
    console.log(`Interview Sessions: ${insertedSessions.length}`);
    console.log(`Detection Events: ${totalEvents}`);
    console.log(`Proctoring Reports: ${insertedReports.length}`);
    console.log('=======================\n');
    
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

/**
 * Clear all data from the database
 */
export async function clearDatabase(): Promise<void> {
  try {
    console.log('Clearing database...');
    
    await connectToDatabase();
    
    await DetectionEvent.deleteMany({});
    await InterviewSession.deleteMany({});
    await ProctoringReport.deleteMany({});
    
    console.log('Database cleared successfully!');
  } catch (error) {
    console.error('Error clearing database:', error);
    throw error;
  }
}

/**
 * CLI script runner
 */
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'seed':
      seedDatabase()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
      break;
    case 'clear':
      clearDatabase()
        .then(() => process.exit(0))
        .catch((error) => {
          console.error(error);
          process.exit(1);
        });
      break;
    default:
      console.log('Usage: npm run seed [seed|clear]');
      console.log('  seed  - Populate database with sample data');
      console.log('  clear - Clear all data from database');
      process.exit(1);
  }
}