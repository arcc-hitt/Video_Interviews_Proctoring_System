# Video Proctoring System

Real-time interview proctoring built for modern hiring workflows. This platform combines live video streaming, computer vision, and role-based dashboards to help teams monitor interviews, detect suspicious behavior, and generate actionable reports without slowing the experience down.

[![Live Demo](https://img.shields.io/badge/Live-Demo-blue?style=for-the-badge)](https://video-interviews-proctoring-system.vercel.app)

> Note: open the live demo in one browser as a candidate and in another browser as an interviewer, then create a session and test the full flow.

## Why It Stands Out

- Real-time candidate monitoring with WebRTC and Socket.IO
- Computer vision powered by MediaPipe, TensorFlow.js, and BlazeFace
- Smart alerts for face loss, gaze shifts, and unauthorized objects
- Separate candidate and interviewer experiences with role-based access
- Reports that summarize session integrity with timelines and scores
- Cloudinary support for scalable video and report storage

## What You Can Do

- Start an interview session and share a session ID instantly
- Join as a candidate and stream video in real time
- Track attention and suspicious activity as the interview happens
- Review alerts, session history, and post-interview reports
- Export results for record keeping and follow-up

## Tech Stack

**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Shadcn UI  
**Backend:** Node.js, Express, TypeScript, Socket.IO  
**Database:** MongoDB with Mongoose ODM  
**Computer Vision:** MediaPipe, TensorFlow.js, BlazeFace  
**Auth:** JWT with role-based access control  
**Realtime:** WebSocket streaming for live updates  
**Storage:** Cloudinary for media uploads and delivery

## Quick Start

### Prerequisites

- Node.js v18 or higher
- MongoDB local or cloud instance
- npm or yarn
- Cloudinary account if you want cloud storage enabled

### Install

```bash
git clone https://github.com/arcc-hitt/Video_Interviews_Proctoring_System.git
cd Video_Interviews_Proctoring_System
npm run install:all
```

### Environment Setup

Create the backend env file:

```bash
# Windows
copy backend\.env.example backend\.env

# macOS/Linux
cp backend/.env.example backend/.env
```

Example backend values:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/video-proctoring
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

Create the frontend env file:

```bash
# Windows
copy frontend\.env.example frontend\.env

# macOS/Linux
cp frontend/.env.example frontend/.env
```

Example frontend values:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000
```

### Run Locally

Start both apps:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:backend
npm run dev:frontend
```

## How To Use It

1. Start MongoDB or connect to your cloud database.
2. Launch the app with `npm run dev`.
3. Sign up or sign in as an interviewer.
4. Sign up or sign in as a candidate.
5. Create a session from the interviewer dashboard.
6. Join the session from the candidate side using the session ID.
7. Watch live alerts, detection signals, and session metrics appear in real time.
8. Generate reports after the interview finishes.

**Audio tip:** if you test with two tabs on the same browser, mute one side or use two browsers/devices to avoid feedback noise.

## Cloudinary Setup

If you enable Cloudinary, video recordings and reports can be stored remotely instead of locally.

1. Create a free [Cloudinary account](https://cloudinary.com)
2. Copy the Cloud Name, API Key, and API Secret from your dashboard
3. Add them to `backend/.env`
4. Restart the backend to enable cloud storage

## Scripts

**Root**

- `npm run install:all` installs dependencies for all packages
- `npm run dev` starts frontend and backend together
- `npm run build` creates production builds
- `npm run lint` runs linting across the workspace

**Backend**

- `npm run dev` starts the API server with hot reload
- `npm run build` compiles TypeScript
- `npm run test` runs backend tests
- `npm run seed` seeds sample data

**Frontend**

- `npm run dev` starts the Vite app
- `npm run build` builds the client for production
- `npm run preview` previews the production build
- `npm run test` runs component tests

## Project Layout

```text
frontend/   React + TypeScript UI
backend/    Express + TypeScript API
shared/     Shared TypeScript types
```

## Deployment

- Frontend: Vercel
- Backend: Railway
- Database: MongoDB Atlas

## Contributing

1. Fork the repository.
2. Create a branch for your work.
3. Commit your changes.
4. Push the branch and open a pull request.