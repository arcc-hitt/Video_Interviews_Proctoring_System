# Requirements Document

## Introduction

The Video Proctoring System is a comprehensive web application designed to monitor candidates during online interviews. The system detects focus levels, identifies unauthorized items, and generates detailed proctoring reports to ensure interview integrity. Built using the MERN stack with TypeScript, Vite, Shadcn UI, and Tailwind CSS, it provides real-time monitoring capabilities with computer vision and object detection technologies.

## Requirements

### Requirement 1

**User Story:** As an interviewer, I want to see the candidate's live video feed on a simple web interface, so that I can conduct the interview while monitoring their behavior.

#### Acceptance Criteria

1. WHEN the interview session starts THEN the system SHALL display the candidate's live video feed in real-time
2. WHEN the candidate joins the session THEN the system SHALL automatically begin recording their video
3. WHEN the video feed is active THEN the system SHALL store the recorded video for later review
4. WHEN the interface loads THEN the system SHALL provide a clean, simple layout optimized for interview monitoring

### Requirement 2

**User Story:** As an interviewer, I want to receive real-time alerts about suspicious events, so that I can take immediate action during the interview.

#### Acceptance Criteria

1. WHEN a suspicious event is detected THEN the system SHALL display an immediate visual alert on the interface
2. WHEN the candidate looks away for more than 5 seconds THEN the system SHALL trigger a "User looking away" alert
3. WHEN no face is detected for more than 10 seconds THEN the system SHALL trigger a "Candidate absent" alert
4. WHEN unauthorized items are detected THEN the system SHALL display specific item alerts (phone, books, notes, devices)

### Requirement 3

**User Story:** As a system administrator, I want the system to accurately detect when candidates lose focus, so that interview integrity can be maintained.

#### Acceptance Criteria

1. WHEN the candidate's gaze direction changes away from the screen THEN the system SHALL start a 5-second timer
2. IF the candidate continues looking away for more than 5 seconds THEN the system SHALL log a focus loss event with timestamp
3. WHEN no face is present in the video frame THEN the system SHALL start a 10-second timer
4. IF no face remains absent for more than 10 seconds THEN the system SHALL log an absence event with timestamp
5. WHEN multiple faces appear in the frame THEN the system SHALL immediately log a multiple faces event
6. WHEN any focus-related event occurs THEN the system SHALL record the exact timestamp and duration

### Requirement 4

**User Story:** As a system administrator, I want the system to detect unauthorized items in the video feed, so that cheating attempts can be identified and logged.

#### Acceptance Criteria

1. WHEN a mobile phone appears in the video frame THEN the system SHALL detect and log the phone presence with timestamp
2. WHEN books or paper notes are visible THEN the system SHALL identify and log these items with timestamp
3. WHEN extra electronic devices are detected THEN the system SHALL flag and log these devices with timestamp
4. WHEN any unauthorized item is detected THEN the system SHALL maintain continuous monitoring until the item is removed
5. WHEN object detection runs THEN the system SHALL use YOLO or TensorFlow.js for accurate item identification

### Requirement 5

**User Story:** As a system administrator, I want all detection events stored in a database, so that comprehensive reports can be generated later.

#### Acceptance Criteria

1. WHEN any detection event occurs THEN the system SHALL store the event data in MongoDB with complete details
2. WHEN storing events THEN the system SHALL include candidate ID, event type, timestamp, duration, and confidence score
3. WHEN the backend receives event data THEN the system SHALL provide REST API endpoints for data retrieval
4. WHEN data is stored THEN the system SHALL ensure data integrity and proper indexing for efficient queries

### Requirement 6

**User Story:** As an interviewer, I want to generate detailed proctoring reports, so that I can assess the candidate's interview integrity.

#### Acceptance Criteria

1. WHEN an interview session ends THEN the system SHALL generate a comprehensive proctoring report
2. WHEN generating reports THEN the system SHALL include candidate name, interview duration, and total focus loss incidents
3. WHEN calculating integrity scores THEN the system SHALL use the formula: 100 - deductions based on violations
4. WHEN reports are created THEN the system SHALL provide export options in PDF and CSV formats
5. WHEN displaying reports THEN the system SHALL show detailed timestamps for all suspicious events
6. WHEN multiple faces are detected THEN the system SHALL include these incidents in the final report

### Requirement 7

**User Story:** As a developer, I want the system built with modern technologies and best practices, so that it's maintainable and scalable.

#### Acceptance Criteria

1. WHEN building the frontend THEN the system SHALL use React with TypeScript and Vite for development
2. WHEN styling the interface THEN the system SHALL use Tailwind CSS and Shadcn UI components
3. WHEN implementing the backend THEN the system SHALL use Node.js with Express and TypeScript
4. WHEN storing data THEN the system SHALL use MongoDB for event logging and report storage
5. WHEN implementing computer vision THEN the system SHALL use OpenCV, MediaPipe, or TensorFlow.js
6. WHEN deploying THEN the system SHALL be deployable to cloud platforms with proper documentation

### Requirement 8

**User Story:** As a system user, I want bonus features for enhanced monitoring, so that the proctoring system provides comprehensive surveillance.

#### Acceptance Criteria

1. IF eye closure detection is implemented THEN the system SHALL detect and log drowsiness events
2. IF audio detection is implemented THEN the system SHALL identify and log background voices
3. IF real-time alerts are enhanced THEN the system SHALL provide immediate notifications to interviewers
4. WHEN bonus features are active THEN the system SHALL integrate seamlessly with core functionality
5. WHEN additional detection occurs THEN the system SHALL include bonus feature events in final reports