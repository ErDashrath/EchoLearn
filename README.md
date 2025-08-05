# EchoLearn: Your AI English & Interview Coach

![Project Banner](https://placehold.co/1200x400/1E90FF/FFFFFF?text=EchoLearn%0AEnglish%20%26%20Interview%20Practice)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)
[![Contributions Welcome](https://img.shields.io/badge/Contributions-welcome-brightgreen.svg)](#contributing)
[![GitHub stars](https://img.shields.io/github/stars/ErDashrath/EchoLearn.svg?style=social&label=Star)](https://github.com/ErDashrath/EchoLearn)

Your personal AI coach for mastering English and acing job interviews. EchoLearn is a modern web application that connects to your Ollama server, helping you practice conversations and role-play interview scenarios in a private, judgment-free environment.

## ✨ Key Features

* **🗣️ Conversational Practice:** Improve your fluency by chatting about any topic
* **👔 Interview Simulation:** Role-play interviews for various job roles
* **🎭 Roleplay Scenarios:** Practice real-world situations like ordering food, asking for directions
* **📝 Grammar Correction:** Get real-time grammar suggestions and feedback
* **🌐 Remote Ollama Support:** Connect to local or remote Ollama servers via Cloudflare tunnels
* **🔒 Private & Secure:** All conversations can run locally on your hardware
* **💾 Session Management:** Save and export your practice sessions
* **🎨 Modern UI:** Beautiful, responsive interface with dark/light themes

## 🏗️ Architecture

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Express.js + TypeScript
- **Database:** PostgreSQL with Drizzle ORM
- **AI Engine:** Ollama (Llama 3.1 or other models)
- **Deployment:** Supports local and remote Ollama instances

## 🚀 Quick Start

### Prerequisites

1. **Ollama Server** (local or remote)
2. **Node.js 18+**
3. **PostgreSQL database**

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ErDashrath/EchoLearn.git
   cd EchoLearn
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Configure your environment:**
   ```env
   # Ollama Configuration
   OLLAMA_BASE_URL=https://your-cloudflare-tunnel.trycloudflare.com
   OLLAMA_FALLBACK_URL=http://localhost:11434
   
   # Database
   DATABASE_URL=postgresql://user:password@localhost:5432/echolearn
   
   # Server
   PORT=5000
   NODE_ENV=development
   ```

5. **Set up the database:**
   ```bash
   npm run db:push
   ```

6. **Start the development server:**
   ```bash
   npm run dev
   ```

## 🌐 Ollama Server Setup

### Local Ollama

1. **Install Ollama:**
   ```bash
   curl -fsSL https://ollama.com/install.sh | sh
   ```

2. **Pull and run a model:**
   ```bash
   ollama pull llama3.1
   ollama serve
   ```

### Remote Ollama with Cloudflare Tunnel

1. **Install cloudflared:**
   ```bash
   # Download from https://github.com/cloudflare/cloudflared/releases
   ```

2. **Create a tunnel to your Ollama server:**
   ```bash
   cloudflared tunnel --url http://localhost:11434
   ```

3. **Update your .env file with the tunnel URL**

## 🎯 Usage Modes

### Conversation Mode
Practice natural, everyday English conversations on any topic.

### Interview Mode  
Simulate job interviews with AI acting as a professional interviewer.

### Roleplay Mode
Practice specific scenarios like:
- Ordering food at restaurants
- Asking for directions
- Shopping interactions
- Business meetings

## 🔧 Focus Settings

- **Fluency Focus:** Emphasizes natural conversation flow
- **Correction Focus:** Provides detailed grammar and pronunciation feedback

## 📊 Features

- **Real-time Chat:** Instant responses from your AI tutor
- **Grammar Analysis:** Automated grammar checking and suggestions
- **Session Export:** Export conversations as TXT, MD, or JSON
- **Progress Tracking:** Monitor your improvement over time
- **Voice Input:** Practice speaking with voice recognition (coming soon)

## 🛠️ Development

### Project Structure
```
EchoLearn/
├── client/          # React frontend
├── server/          # Express.js backend
├── shared/          # Shared TypeScript types
└── README.md
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run db:push` - Push database schema
- `npm run check` - Type checking

## 🤝 Contributing

Contributions are welcome! Please feel free to:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---
*Created by **Dashrath***
