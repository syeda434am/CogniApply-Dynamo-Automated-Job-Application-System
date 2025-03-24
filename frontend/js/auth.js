// Store registered users
let registeredUsers = [];
let currentUser = null;

// API base URL - change this to match your FastAPI server
const API_BASE_URL = "http://localhost:8000";

// Show/hide pages
function showPage(pageId) {
    document.querySelectorAll('.auth-form').forEach(page => {
        page.classList.add('hidden');
    });
    document.getElementById(pageId).classList.remove('hidden');
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    showNotification('Logging in...', 'info');

    try {
        console.log('Sending login request to:', `${API_BASE_URL}/login`);
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        console.log('Login response status:', response.status);
        
        if (!response.ok) {
            let errorMessage = 'Login failed';
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                console.error('Error parsing error response:', e);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log('Login successful:', data);
        
        // Save credentials in localStorage for further API requests
        localStorage.setItem('currentUser', JSON.stringify({ username, password }));
        localStorage.setItem('userCredentials', JSON.stringify({ 
            email: username, 
            password: password 
        }));
        
        // Fetch the saved profile (which includes LinkedIn credentials, file URLs, etc.)
        const profileResp = await fetch(`${API_BASE_URL}/profile`, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + btoa(username + ":" + password)
            }
        });
        const profileData = await profileResp.json();
        console.log('Profile data on login:', profileData);
        window.fetchedProfileData = profileData;
        
        // Populate the profile form fields if data exists
        if (profileData.full_name) document.getElementById('full-name').value = profileData.full_name;
        if (profileData.phone) document.getElementById('phone').value = profileData.phone;
        if (profileData.dob) document.getElementById('dob').value = profileData.dob;
        if (profileData.job_title_preference) document.getElementById('job-title-preference').value = profileData.job_title_preference;
        if (profileData.experience_years) document.getElementById('experience-years').value = profileData.experience_years;
        if (profileData.salary_range) document.getElementById('salary-range').value = profileData.salary_range;
        if (profileData.skills) document.getElementById('skills').value = profileData.skills;
        if (profileData.linkedin_url) document.getElementById('linkedin-url').value = profileData.linkedin_url;
        if (profileData.github_url) document.getElementById('github-url').value = profileData.github_url;
        if (profileData.portfolio_url) document.getElementById('portfolio-url').value = profileData.portfolio_url;
        
        // SAFER: Only set innerHTML if the element actually exists
        const resumePreviewElement = document.getElementById('resume-preview');
        const coverLetterPreviewElement = document.getElementById('cover-letter-preview');

        if (profileData.resume_url && resumePreviewElement) {
            resumePreviewElement.innerHTML = `<a href="${profileData.resume_url}" target="_blank">View Resume</a>`;
        }

        if (profileData.cover_letter_url && coverLetterPreviewElement) {
            coverLetterPreviewElement.innerHTML = `<a href="${profileData.cover_letter_url}" target="_blank">View Cover Letter</a>`;
        }   
        
        // Delay updating the LinkedIn button until the dashboard is rendered
        setTimeout(() => {
            if (profileData.linkedin_email && profileData.linkedin_password) {
                const linkedinButton = document.querySelector('.btn-platform.linkedin');
                if (linkedinButton) {
                    linkedinButton.classList.add('connected');
                    linkedinButton.innerHTML = '<i class="fab fa-linkedin"></i> LinkedIn Connected';
                }
            }
        }, 500); // 500ms delay; adjust if needed
        
        // Set current user and display dashboard
        currentUser = { username, email };
        document.getElementById('auth-pages').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        showDashboardSection('profile');
        showNotification('Welcome back! 👋', 'success');
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message, 'error');
        document.getElementById('login-password').value = ''; // Clear password field
    }
});

// Register form handler
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    if (password !== confirmPassword) {
        showNotification("Passwords don't match!", 'error');
        return;
    }

    showNotification('Creating your account...', 'info');

    try {
        console.log('Sending registration request to:', `${API_BASE_URL}/register`);
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                email: email,
                password: password
            })
        });
        
        console.log('Registration response status:', response.status);
        
        if (!response.ok) {
            let errorMessage = 'Registration failed';
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorMessage;
            } catch (e) {
                console.error('Error parsing error response:', e);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        console.log('Registration successful:', data);
        
        showNotification('Registration successful! Please log in 🎉', 'success');
        showPage('login-page');
        // Clear registration form
        document.getElementById('register-form').reset();
    } catch (error) {
        console.error('Registration error:', error);
        showNotification(error.message, 'error');
    }
});

// Logout handler
function logout() {
    currentUser = null;
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('auth-pages').classList.remove('hidden');
    showPage('login-page');
    showNotification('Logged out successfully!', 'info');
}

// Enhanced notification system
function showNotification(message, type = 'success') {
    // Remove existing notification if any
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icon = type === 'success' ? 'check-circle' : 
                 type === 'error' ? 'exclamation-circle' : 
                 'info-circle';
    
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        </div>
        <div class="notification-progress"></div>
    `;
    
    document.body.appendChild(notification);
    
    // Add show class after a small delay for animation
    setTimeout(() => {
        notification.classList.add('show');
        notification.querySelector('.notification-progress').style.width = '0%';
    }, 10);

    // Remove notification after delay
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}