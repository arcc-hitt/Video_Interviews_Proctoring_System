# Video Proctoring System

A comprehensive real-time video interview monitoring platform that leverages advanced computer vision and machine learning to ensure interview integrity. Built with modern web technologies, it provides automated detection of focus levels, unauthorized items, and generates detailed proctoring reports.

[![Live Demo](https://img.shields.io/badge/Live-Demo-blue?style=for-the-badge)](https://video-interviews-proctoring-system.vercel.app)

## Key Features

- **Real-time Video Monitoring** - Live candidate video streams with WebRTC technology
- **AI-Powered Detection** - Face detection, gaze tracking, and object recognition using MediaPipe and TensorFlow.js
- **Focus Analysis** - Automated detection of when candidates look away or leave the frame
- **Object Detection** - Identifies unauthorized items like phones, books, and electronic devices
- **Live Alerts** - Instant notifications to interviewers about suspicious activities
- **Comprehensive Reports** - Detailed proctoring reports with integrity scores and timeline
- **Role-Based Interface** - Separate dashboards for candidates and interviewers
- **Export Capabilities** - PDF and CSV report generation for record keeping
- **Cloud Storage** - Cloudinary integration for scalable video recordings/ reports storage and delivery

## Technology Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Shadcn UI  
**Backend:** Node.js, Express, TypeScript, Socket.IO  
**Database:** MongoDB with Mongoose ODM  
**Computer Vision:** MediaPipe, TensorFlow.js, BlazeFace  
**Authentication:** JWT with role-based access control  
**Real-time Communication:** WebSocket for live data streaming  
**Cloud Storage:** Cloudinary for video recording storage and delivery

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- MongoDB (local installation or cloud instance)
- npm or yarn package manager
- Cloudinary account (optional, for cloud video storage)

### Installation

**Clone the repository:**
```bash
git clone https://github.com/arcc-hitt/Video_Interviews_Proctoring_System.git
cd Video_Interviews_Proctoring_System
```

**Install all dependencies:**

Windows (PowerShell/CMD):
```cmd
npm run install:all
```

macOS/Linux:
```bash
npm run install:all
```

### Environment Configuration

**Backend Configuration:**
```bash
# Windows
copy backend\.env.example backend\.env

# macOS/Linux
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your settings:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/video-proctoring
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:5173

# Cloudinary Configuration (Optional - for cloud video storage)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

**Frontend Configuration:**
```bash
# Windows
copy frontend\.env.example frontend\.env

# macOS/Linux
cp frontend/.env.example frontend/.env
```

Edit `frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000
```

### Running the Application

**Development Mode (both frontend and backend):**
```bash
npm run dev
```

**Or run separately:**

Backend only:
```bash
npm run dev:backend
# Runs on http://localhost:5000
```

Frontend only:
```bash
npm run dev:frontend
# Runs on http://localhost:5173
```

## Usage

1. **Start MongoDB** - Ensure MongoDB is running locally or configure cloud connection
2. **Launch Application** - Run `npm run dev` to start both frontend and backend
3. **Create Accounts** - Register as either candidate or interviewer
4. **Start Session** - Interviewer creates session, candidate joins with session ID
5. **Monitor Interview** - Real-time detection and alerts appear on interviewer dashboard
6. **Generate Reports** - Export detailed proctoring reports after session completion

**Important Audio Note:** When testing with two browser tabs on the same device, you may experience audio feedback (screeching sound). For optimal testing, use two separate devices or mute the audio in the interviewer dashboard.

## Cloud Storage Setup (Optional)

The system supports cloud video storage using Cloudinary for enhanced scalability and reliability:

**Cloudinary Configuration:**
1. Sign up for a free [Cloudinary account](https://cloudinary.com)
2. Get your Cloud Name, API Key, and API Secret from the dashboard
3. Add these credentials to your `backend/.env` file
4. Video recordings will automatically be stored in Cloudinary when configured

**Benefits of Cloudinary Integration:**
- Automatic video optimization and compression
- Global CDN delivery for faster video access
- Scalable storage without server disk limitations
- Built-in video transformation capabilities

## Project Structure

```
├── frontend/                 # React TypeScript frontend
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── services/        # API and computer vision services
│   │   ├── hooks/           # Custom React hooks
│   │   ├── contexts/        # React context providers
│   │   └── utils/           # Utility functions
├── backend/                 # Node.js Express backend
│   ├── src/
│   │   ├── models/          # MongoDB schemas
│   │   ├── routes/          # API endpoints
│   │   ├── services/        # Business logic
│   │   ├── middleware/      # Express middleware
│   │   └── utils/           # Backend utilities
└── shared/                  # Shared TypeScript types
```

## Available Scripts

**Root Level:**
- `npm run install:all` - Install dependencies for all packages
- `npm run dev` - Start both frontend and backend in development
- `npm run build` - Build both frontend and backend for production
- `npm run lint` - Run linting for both packages

**Backend:**
- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript to JavaScript
- `npm run test` - Run test suite
- `npm run seed` - Seed database with sample data

**Frontend:**
- `npm run dev` - Start Vite development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally
- `npm run test` - Run component tests

## Deployment

**Backend:** Deploy to Railway, Render, or similar Node.js hosting platform  
**Frontend:** Deploy to Vercel, Netlify, or similar static hosting service  
**Database:** Use MongoDB Atlas for cloud database hosting

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request