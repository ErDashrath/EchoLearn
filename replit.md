# AI English Tutor - Replit Project Guide

## Overview

This is an AI-powered English learning chatbot application designed to help users improve their English skills through interactive conversations, interviews, and roleplay scenarios. The application provides real-time grammar suggestions, voice input capabilities, and personalized feedback to enhance the learning experience.

The system is built as a full-stack web application with a React frontend and Express.js backend, featuring a minimalist and responsive design optimized for both desktop and mobile use.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript for type safety and modern development practices
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management and caching
- **UI Components**: Radix UI primitives with custom shadcn/ui components for consistent, accessible design
- **Styling**: Tailwind CSS with CSS variables for theming and responsive design
- **Animations**: Framer Motion for smooth micro-interactions and transitions
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Framework**: Express.js with TypeScript for robust server-side development
- **API Design**: RESTful API endpoints following conventional HTTP methods
- **Development Server**: Integration with Vite for seamless full-stack development
- **Error Handling**: Centralized error middleware for consistent error responses
- **Request Logging**: Custom middleware for API request logging and performance monitoring

### Data Layer
- **Database**: PostgreSQL configured through Drizzle ORM for type-safe database operations
- **Schema Management**: Drizzle Kit for database migrations and schema versioning
- **Storage Strategy**: In-memory storage implementation with interface for easy database integration
- **Data Models**: 
  - Users (authentication ready)
  - Chat Sessions (conversation management)
  - Messages (chat history with AI responses)
  - Grammar Suggestions (real-time language feedback)
  - Learning Analytics (progress tracking)

### AI Integration
- **AI Provider**: OpenAI GPT-4o for natural language processing and conversation
- **Features**:
  - Real-time grammar analysis and suggestions
  - Personalized learning feedback
  - Multiple conversation modes (conversation, interview, roleplay)
  - Focus modes (fluency vs. correction emphasis)
- **Response Processing**: Structured AI responses with grammar suggestions and learning insights

### User Experience Features
- **Voice Input**: Web Speech API integration with visual feedback
- **Real-time Chat**: Instant messaging interface with typing indicators
- **Grammar Highlighting**: Interactive grammar suggestions with tooltips
- **Theme Support**: Light/dark mode with system preference detection
- **Mobile Optimization**: Touch-friendly interface with responsive design
- **Export Functionality**: Chat history export in multiple formats (TXT, Markdown, JSON)

### Development Architecture
- **Monorepo Structure**: Shared types and schemas between frontend and backend
- **Type Safety**: End-to-end TypeScript with strict configuration
- **Code Organization**: Feature-based component structure with reusable UI components
- **Path Aliases**: Simplified imports using TypeScript path mapping
- **Development Tools**: Hot reload, error overlays, and debugging support

## External Dependencies

### Core Technologies
- **Database**: Neon PostgreSQL serverless database for scalable data storage
- **AI Service**: OpenAI API for natural language processing and conversation generation
- **Authentication**: Ready for integration with authentication providers (infrastructure in place)

### Development & Build Tools
- **Package Manager**: npm with lockfile for reproducible builds
- **TypeScript**: Strict type checking and modern JavaScript features
- **ESLint/Prettier**: Code quality and formatting (configurable)
- **Replit Integration**: Custom plugins for Replit development environment

### UI & Styling Libraries
- **Radix UI**: Accessible component primitives for complex UI interactions
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Lucide React**: Consistent icon library for UI elements
- **Class Variance Authority**: Type-safe component variant management

### Functionality Libraries
- **TanStack Query**: Server state management with caching and synchronization
- **React Hook Form**: Form state management with validation
- **Date-fns**: Date manipulation and formatting utilities
- **Framer Motion**: Animation library for enhanced user interactions
- **Zod**: Runtime type validation and schema parsing

### Development Environment
- **Vite**: Fast build tool with HMR and optimized production builds
- **TSX**: TypeScript execution for development server
- **PostCSS**: CSS processing with Tailwind and autoprefixer
- **Drizzle Kit**: Database schema management and migrations