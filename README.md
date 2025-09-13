# Video Proctoring System

A comprehensive web application designed to monitor candidates during online interviews using computer vision and machine learning technologies.

## 🚀 Quick Deploy

**Backend**: [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

**Frontend**: [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

📖 **[Complete Deployment Guide](./DEPLOYMENT.md)**

## Project Structure

```
├── frontend/          # React TypeScript frontend with Vite
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API services and CV processing
│   │   ├── hooks/         # Custom React hooks
│   │   ├── types/         # TypeScript type definitions
│   │   ├── utils/         # Utility functions
│   │   └── lib/           # Shared libraries (Shadcn UI utils)
│   └── ...
├── backend/           # Node.js Express TypeScript backend
│   ├── src/
│   │   ├── models/        # MongoDB models
│   │   ├── routes/        # API routes
│   │   ├── middleware/    # Express middleware
│   │   ├── services/      # Business logic services
│   │   ├── utils/         # Utility functions
│   │   └── types/         # TypeScript type definitions
│   └── ...
└── .kiro/             # Kiro specifications and configuration
```

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **Shadcn UI** for component library
- **MediaPipe** and **TensorFlow.js** for computer vision

### Backend
- **Node.js** with Express and TypeScript
- **MongoDB** with Mongoose ODM
- **JWT** for authentication
- **WebSocket** for real-time communication

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env  # Configure your environment variables
npm run dev
```

## Features

- **Real-time Video Monitoring**: Live video feed with WebRTC
- **Focus Detection**: Tracks candidate attention and gaze direction
- **Object Detection**: Identifies unauthorized items (phones, books, etc.)
- **Alert System**: Real-time notifications for suspicious activities
- **Report Generation**: Comprehensive proctoring reports with integrity scores
- **Export Options**: PDF and CSV export capabilities

## Development

### Frontend Development
- Uses Vite for hot module replacement
- Configured with ESLint and Prettier
- Shadcn UI components for consistent design
- Path aliases configured for clean imports

### Backend Development
- TypeScript with strict mode enabled
- Nodemon for automatic server restart
- ESLint and Prettier for code quality
- Structured folder organization

## License

This project is licensed under the ISC License.