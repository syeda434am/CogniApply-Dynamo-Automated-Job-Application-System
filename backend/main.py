# main.py
from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, UploadFile, File, Depends, Body
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, EmailStr, validator
import json
from fastapi import Form, Request
import os
import logging
import asyncio
import bcrypt
import secrets
from typing import Optional, Dict, List
# Import the LinkedIn automation function
from platforms.linkedin import LinkedInAutomator
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from threading import Thread
from queue import Queue
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.FileHandler("app.log"), logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="LinkedIn Job Application Automation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development only. In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# With these lines that point to the correct paths
app.mount("/js", StaticFiles(directory="../frontend/js"), name="js")
app.mount("/css", StaticFiles(directory="../frontend/css"), name="css")

# Also update the index.html path in the read_index function
@app.get("/")
async def read_index():
    return FileResponse("../frontend/index.html")

BASE_DIR = "../users"
ws_connections: Dict[str, WebSocket] = {}  # Dictionary to store active WebSocket connections
active_automation_tasks: Dict[str, asyncio.Task] = {}  # Track automation tasks
# Message queue for WebSocket communication
ws_message_queues = {}

security = HTTPBasic()

# Ensure the base user directory exists
if not os.path.exists(BASE_DIR):
    os.makedirs(BASE_DIR)

async def async_noop(msg):
    pass

# Helper functions to read/write JSON
def read_json(filepath):
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            return json.load(f)
    return {}

def write_json(filepath, data):
    with open(filepath, "w") as f:
        json.dump(data, f, indent=4)

# Password hashing helpers
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed_password.encode())

# Basic authentication
def get_current_username(credentials: HTTPBasicCredentials = Depends(security)):
    user_dir = os.path.join(BASE_DIR, credentials.username)
    credentials_file = os.path.join(user_dir, "credentials.json")
    
    if not os.path.exists(credentials_file):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    saved_credentials = read_json(credentials_file)
    is_valid = verify_password(credentials.password, saved_credentials["password"])
    
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    return credentials.username

# Pydantic models for requests
class UserRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    
    @validator('password')
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v

class ProfileData(BaseModel):
    full_name: str
    phone: str
    dob: str
    job_title_preference: str
    experience_years: int
    salary_range: str
    skills: str
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    linkedin_email: Optional[str] = None
    linkedin_password: Optional[str] = None

class JobSearchParams(BaseModel):
    job_title: str
    location: str
    applications_limit: int = 5

class ApplicationStatus(BaseModel):
    job_id: str
    job_title: str
    company: str
    status: str
    applied_date: str

# WebSocket endpoint for real-time updates
@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await websocket.accept()
    ws_connections[username] = websocket
    
    # Create message queue for this user if it doesn't exist
    if username not in ws_message_queues:
        ws_message_queues[username] = Queue()
    
    try:
        while True:
            # Check for messages in the queue
            if not ws_message_queues[username].empty():
                message = ws_message_queues[username].get()
                await websocket.send_text(json.dumps(message))
            
            # Send heartbeat every 30 seconds
            await websocket.send_text(json.dumps({"type": "heartbeat"}))
            await asyncio.sleep(30)
            
    except WebSocketDisconnect:
        ws_connections.pop(username, None)

# Registration endpoint
@app.post("/register")
async def register(user: UserRequest):
    user_dir = os.path.join(BASE_DIR, user.username)
    if os.path.exists(user_dir):
        raise HTTPException(status_code=400, detail="User already exists")
    
    try:
        os.makedirs(user_dir)
        credentials = {"email": user.email, "password": hash_password(user.password)}
        write_json(os.path.join(user_dir, "credentials.json"), credentials)
        # Initialize empty profile and applications file
        write_json(os.path.join(user_dir, "profile.json"), {})
        write_json(os.path.join(user_dir, "applications.json"), [])
        logger.info(f"User registered: {user.username}")
        return {"message": "User registered successfully"}
    except Exception as e:
        logger.error(f"Registration error: {str(e)}")
        raise HTTPException(status_code=500, detail="Registration failed")

# Login endpoint
@app.post("/login")
async def login(user: UserRequest):
    user_dir = os.path.join(BASE_DIR, user.username)
    credentials_file = os.path.join(user_dir, "credentials.json")
    
    if not os.path.exists(credentials_file):
        raise HTTPException(status_code=400, detail="User does not exist")
    
    credentials = read_json(credentials_file)
    if not verify_password(user.password, credentials["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    logger.info(f"User logged in: {user.username}")
    return {"message": "Login successful"}

# Create a function to handle the profile endpoint
@app.post("/profile")
async def save_profile(
    username: str = Depends(get_current_username),
    full_name: str = Form(...),
    phone: str = Form(...),
    dob: str = Form(...),
    job_title_preference: str = Form(...),
    experience_years: int = Form(...),
    salary_range: str = Form(...),
    skills: str = Form(...),
    linkedin_url: Optional[str] = Form(None),
    github_url: Optional[str] = Form(None),
    portfolio_url: Optional[str] = Form(None),
    linkedin_email: Optional[str] = Form(None),
    linkedin_password: Optional[str] = Form(None),
    file_resume: Optional[UploadFile] = File(None),
    file_cover: Optional[UploadFile] = File(None)
):
    user_dir = os.path.join(BASE_DIR, username)
    
    try:
        # Create profile data using the Pydantic model
        profile_data = ProfileData(
            full_name=full_name,
            phone=phone,
            dob=dob,
            job_title_preference=job_title_preference,
            experience_years=experience_years,
            salary_range=salary_range,
            skills=skills,
            linkedin_url=linkedin_url,
            github_url=github_url,
            portfolio_url=portfolio_url,
            linkedin_email=linkedin_email,
            linkedin_password=linkedin_password
        )
        
        # Save profile data to profile.json
        write_json(os.path.join(user_dir, "profile.json"), profile_data.dict())
        
        # Save resume file if provided
        if file_resume:
            file_extension = file_resume.filename.split('.')[-1].lower()
            if file_extension not in ['pdf', 'docx']:
                raise HTTPException(status_code=400, detail="Resume must be PDF or DOCX format")
            
            resume_path = os.path.join(user_dir, f"resume.{file_extension}")
            with open(resume_path, "wb") as f:
                content = await file_resume.read()
                f.write(content)
        
        # Save cover letter file if provided
        if file_cover:
            file_extension = file_cover.filename.split('.')[-1].lower()
            cover_path = os.path.join(user_dir, f"cover_letter.{file_extension}")
            with open(cover_path, "wb") as f:
                content = await file_cover.read()
                f.write(content)
        
        logger.info(f"Profile updated for user: {username}")
        return {"message": "Profile saved successfully"}
    except Exception as e:
        logger.error(f"Profile update error for {username}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save profile: {str(e)}")
    
@app.get("/profile")
async def get_profile(username: str = Depends(get_current_username)):
    user_dir = os.path.join(BASE_DIR, username)
    profile_file = os.path.join(user_dir, "profile.json")
    
    profile_data = {}
    if os.path.exists(profile_file):
        profile_data = read_json(profile_file)
    
    # Check for resume file (pdf or docx)
    for ext in ['pdf', 'docx']:
        resume_path = os.path.join(user_dir, f"resume.{ext}")
        if os.path.exists(resume_path):
            profile_data['resume_url'] = f"/Projects/AI-Job-Automation/CogniApply-Dynamo-Automated-Job-Application-System/users/{username}/resume.{ext}"
            break
    
    # Check for cover letter file (any extension, or restrict as needed)
    for ext in ['pdf', 'docx']:
        cover_path = os.path.join(user_dir, f"cover_letter.{ext}")
        if os.path.exists(cover_path):
            profile_data['cover_letter_url'] = f"/Projects/AI-Job-Automation/CogniApply-Dynamo-Automated-Job-Application-System/users/{username}/cover_letter.{ext}"
            break
    
    return profile_data

@app.post("/delete-file")
async def delete_file(
    file_type: str = Body(...),
    username: str = Depends(get_current_username)
):
    user_dir = os.path.join(BASE_DIR, username)
    
    try:
        if file_type == 'resume':
            # Remove both PDF and DOCX versions if they exist
            for ext in ['pdf', 'docx']:
                file_path = os.path.join(user_dir, f"resume.{ext}")
                if os.path.exists(file_path):
                    os.remove(file_path)
        elif file_type == 'cover_letter':
            for ext in ['pdf', 'docx']:
                file_path = os.path.join(user_dir, f"cover_letter.{ext}")
                if os.path.exists(file_path):
                    os.remove(file_path)
        else:
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        # Update profile.json to remove the file URL
        profile_file = os.path.join(user_dir, "profile.json")
        if os.path.exists(profile_file):
            profile_data = read_json(profile_file)
            if file_type == 'resume':
                profile_data.pop('resume_url', None)
            else:
                profile_data.pop('cover_letter_url', None)
            write_json(profile_file, profile_data)
        
        return {"message": f"{file_type} deleted successfully"}
    
    except Exception as e:
        logger.error(f"Error deleting {file_type} for {username}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete {file_type}")
    
# Function to handle the automation process asynchronously
# Replace the run_automation function in main.py with this version:
def run_automation(username: str, search_params: JobSearchParams):
    user_dir = os.path.join(BASE_DIR, username)
    profile_file = os.path.join(user_dir, "profile.json")
    applications_file = os.path.join(user_dir, "applications.json")
    
    # Find resume file
    resume_path = None
    for ext in ['pdf', 'docx']:
        temp_path = os.path.join(user_dir, f"resume.{ext}")
        if os.path.exists(temp_path):
            resume_path = temp_path
            break
    
    if not resume_path:
        logger.error(f"Resume not found for {username}")
        ws_message_queues[username].put({"type": "error", "message": "Resume not found"})
        return
    
    profile = read_json(profile_file)
    applications = read_json(applications_file)
    
    try:
        # Create a status callback function to queue updates for WebSockets
        def status_callback(message):
            if username in ws_message_queues:
                ws_message_queues[username].put({"type": "status", "message": message})
        
        automator = LinkedInAutomator(
            username=username,
            resume_path=resume_path,
            profile_data=profile,
            linkedin_credentials={
                "email": profile.get("linkedin_email"),
                "password": profile.get("linkedin_password")
            },
            headless=True
        )
        
        # Send initial status
        status_callback("Starting LinkedIn automation...")
        
        # Create a synchronous wrapper for the async status callback
        async def async_status_callback(message):
            status_callback(message)
        
        # Create an event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        # Run the automation with the status callback
        job_results = loop.run_until_complete(automator.apply_to_jobs(
            job_title=search_params.job_title,
            location=search_params.location,
            limit=search_params.applications_limit,
            status_callback=async_status_callback
        ))
        
        for job in job_results["jobs"]:
            applications.append(job)
        
        # Make sure we always have a valid job_results structure, even if empty
        if not job_results or "jobs" not in job_results:
            job_results = {"jobs": []}

        result_dict = {
            "totalJobs": len(job_results["jobs"]),
            "appliedJobs": len(job_results["jobs"]),
            "applications": job_results["jobs"],
            "successRate": 0 if len(job_results["jobs"]) == 0 else 100  # Add success rate
        }

        # Always write to applications file, even if empty
        write_json(applications_file, applications)
        logger.info(f"Automation completed for {username}: {len(job_results['jobs'])} jobs")
        
        # Send completion message
        if username in ws_message_queues:
            ws_message_queues[username].put({
                "type": "complete", 
                "results": result_dict
            })
    
    except Exception as e:
        logger.error(f"Automation error for {username}: {str(e)}")
        if username in ws_message_queues:
            ws_message_queues[username].put({
                "type": "error", 
                "message": f"Automation error: {str(e)}"
            })
    
    finally:
        active_automation_tasks.pop(username, None)


# Helper function to send status updates via WebSocket
async def send_status_update(username: str, message: str):
    if username in ws_connections:
        try:
            await ws_connections[username].send_text(
                json.dumps({"type": "status", "message": message})
            )
        except Exception as e:
            logger.error(f"Error sending status update to {username}: {str(e)}")

@app.post("/apply")
async def apply_jobs(
    search_params: JobSearchParams,
    username: str = Depends(get_current_username)
):
    user_dir = os.path.join(BASE_DIR, username)
    profile_file = os.path.join(user_dir, "profile.json")
    
    if not os.path.exists(profile_file):
        raise HTTPException(status_code=400, detail="Profile not found. Please complete your profile first")
    
    # Check if there's already an active automation task
    if username in active_automation_tasks:
        raise HTTPException(status_code=400, detail="An automation task is already running")
    
    # Create message queue if it doesn't exist
    if username not in ws_message_queues:
        ws_message_queues[username] = Queue()
    
    # Start the automation in a separate thread
    automation_thread = Thread(target=run_automation, args=(username, search_params))
    automation_thread.daemon = True
    automation_thread.start()
    
    # Store thread reference
    active_automation_tasks[username] = automation_thread
    
    return {"message": "Job application process started"}

async def websocket_message_dispatcher():
    """Background task to dispatch messages from queues to WebSockets"""
    while True:
        for username, queue in ws_message_queues.items():
            if username in ws_connections and not queue.empty():
                message = queue.get()
                try:
                    await ws_connections[username].send_text(json.dumps(message))
                except Exception as e:
                    logger.error(f"Error sending message to {username}: {str(e)}")
        
        await asyncio.sleep(0.1)  # Small delay to prevent CPU overuse

# Start the dispatcher when the app starts
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(websocket_message_dispatcher())

# Get application history
@app.get("/applications", response_model=List[ApplicationStatus])
async def get_applications(username: str = Depends(get_current_username)):
    applications_file = os.path.join(BASE_DIR, username, "applications.json")
    applications = read_json(applications_file)
    return applications

# Stop ongoing automation
@app.post("/stop-automation")
async def stop_automation(username: str = Depends(get_current_username)):
    if username not in active_automation_tasks:
        raise HTTPException(status_code=400, detail="No active automation session found")
    
    try:
        # Cancel the task
        active_automation_tasks[username].cancel()
        active_automation_tasks.pop(username)
        logger.info(f"Automation stopped for user: {username}")
        return {"message": "Automation stopped successfully"}
    except Exception as e:
        logger.error(f"Error stopping automation for {username}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to stop automation")