# CogniApply-Dynamo-Automated-Job-Application-System

## Overview
CogniApply-Dynamo is an advanced automated job application system designed to streamline the process of applying for jobs on Job application platforms. By leveraging web automation, CV parsing, and AI-based form filling, the system helps users automatically complete application forms with minimal manual intervention.

[Currently only implemented for linkedin, more platforms will be added soon.]

## Key Features
- 🤖 Automated Job Application Process
- 📄 Intelligent CV Extraction & Form Filling
- 🔒 Secure User Management
- 🌐 Real-Time Application Status Updates
- 🧠 AI-Powered Application Assistance

## Technology Stack
- Backend: FastAPI
- Web Automation: Selenium, undetected-chromedriver
- CV Parsing: pdfplumber
- AI Integration: OpenAI GPT-4 API
- Frontend: HTML, CSS, JavaScript

## How It Works

### User Registration & Profile Setup
- Create a user profile with personal details
- Upload resume (PDF or DOCX)
- Configure job preferences

### Automated Application Process
1. Extract text from uploaded resume
2. Use OpenAI GPT-4 to intelligently fill application forms
3. Automate job application process
4. Provide real-time status updates

## Project Structure
```
CogniApply-Dynamo-Automated-Job-Application-System/
├── backend/
│   ├── main.py                   # FastAPI application
│   └── platforms/
│       └── linkedin.py           # LinkedIn job automation
└── frontend/
    ├── index.html                # Main interface
    ├── css/
    │   └── style.css             # Styling
    └── js/
        ├── auth.js               # Authentication logic
        ├── dashboard.js          # Status handling
        └── profile.js            # Profile management
```

## Prerequisites
- Python 3.8+
- Node.js (optional)
- Modern web browser

## Installation & Setup

### Backend Setup
1. Clone the repository
```bash
git clone https://github.com/syeda434am/CogniApply-Dynamo-Automated-Job-Application-System
cd CogniApply-Dynamo-Automated-Job-Application-System
```

2. Create Virtual Environment
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

3. Install Dependencies
```bash
pip install -r backend/requirements.txt
```

4. Set Environment Variables
Create a `.env` file with:
```
OPENAI_API_KEY=your_openai_api_key_here
```

### Running the Application
```bash
uvicorn backend.main:app --reload
```

Then access the application at `http://localhost:8000` to test the FastAPI backend if needed. Open the HTML file to access the whole application with a responsive interactive UI in real-time.

## Usage
1. Register a new user account
2. Complete your profile
3. Upload resume
4. Configure job search parameters
5. Start automated job applications

## License
This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments
- FastAPI
- Selenium
- undetected-chromedriver
- OpenAI GPT-4 API

## Disclaimer
Automated job applications should comply with LinkedIn's terms of service. Use responsibly.