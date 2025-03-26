// Store registered users
let registeredUsers = [];
let currentUser = null;

// API base URL - change this to match your FastAPI server
const API_BASE_URL = "http://localhost:8000";

// Check session on page load
document.addEventListener('DOMContentLoaded', async () => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        const user = JSON.parse(storedUser);
        try {
            // Verify the session is still valid
            const response = await fetch(`${API_BASE_URL}/profile`, {
                headers: {
                    'Authorization': 'Basic ' + btoa(user.username + ":" + user.password)
                }
            });
            
            if (response.ok) {
                currentUser = user;
                const profileData = await response.json();
                window.fetchedProfileData = profileData;
                
                document.getElementById('auth-pages').classList.add('hidden');
                document.getElementById('dashboard').classList.remove('hidden');
                
                // Restore the last active section
                const lastSection = localStorage.getItem('lastSection') || 'profile';
                showDashboardSection(lastSection);
                
                // Populate profile form if we're in profile section
                if (lastSection === 'profile') {
                    populateProfileForm(profileData);
                }
            } else {
                localStorage.removeItem('currentUser');
                showPage('login-page');
            }
        } catch (error) {
            console.error('Session verification failed:', error);
            localStorage.removeItem('currentUser');
            showPage('login-page');
        }
    }
});

// Show/hide pages
function showPage(pageId) {
    document.querySelectorAll('.auth-form').forEach(page => {
        page.classList.add('hidden');
    });
    document.getElementById(pageId).classList.remove('hidden');
}

function populateProfileForm(profileData) {
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
    
    // Update file previews
    updateFilePreviews(profileData);
    
    // Update LinkedIn connection status
    if (profileData.linkedin_email && profileData.linkedin_password) {
        const linkedinButton = document.querySelector('.btn-platform.linkedin');
        if (linkedinButton) {
            linkedinButton.classList.add('connected');
            linkedinButton.innerHTML = '<i class="fab fa-linkedin"></i> LinkedIn Connected';
        }
    }
}

function updateFilePreviews(profileData) {
    const resumePreviewElement = document.getElementById('resume-preview');
    const coverLetterPreviewElement = document.getElementById('cover-letter-preview');

    if (profileData.resume_url && resumePreviewElement) {
        resumePreviewElement.innerHTML = `
            <div class="file-preview">
                <a href="${profileData.resume_url}" target="_blank" class="preview-link">
                    <i class="fas fa-file-pdf"></i>
                    View Resume
                </a>
                <button onclick="deleteFile('resume')" class="delete-file">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }

    if (profileData.cover_letter_url && coverLetterPreviewElement) {
        coverLetterPreviewElement.innerHTML = `
            <div class="file-preview">
                <a href="${profileData.cover_letter_url}" target="_blank" class="preview-link">
                    <i class="fas fa-file-pdf"></i>
                    View Cover Letter
                </a>
                <button onclick="deleteFile('cover_letter')" class="delete-file">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    showNotification('Logging in...', 'info');

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
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
        
        // Save credentials in localStorage
        const userCredentials = { username, email, password };
        localStorage.setItem('currentUser', JSON.stringify(userCredentials));
        
        // Fetch the saved profile
        const profileResp = await fetch(`${API_BASE_URL}/profile`, {
            headers: {
                'Authorization': 'Basic ' + btoa(username + ":" + password)
            }
        });
        const profileData = await profileResp.json();
        window.fetchedProfileData = profileData;
        
        // Set current user and display dashboard
        currentUser = userCredentials;
        document.getElementById('auth-pages').classList.add('hidden');
        document.getElementById('dashboard').classList.remove('hidden');
        showDashboardSection('profile');
        
        // Populate profile form
        populateProfileForm(profileData);
        
        showNotification('Welcome back! 👋', 'success');
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message, 'error');
        document.getElementById('login-password').value = '';
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
        
        showNotification('Registration successful! Please log in 🎉', 'success');
        showPage('login-page');
        document.getElementById('register-form').reset();
    } catch (error) {
        console.error('Registration error:', error);
        showNotification(error.message, 'error');
    }
});

// Logout handler
function logout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    localStorage.removeItem('lastSection');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('auth-pages').classList.remove('hidden');
    showPage('login-page');
    showNotification('Logged out successfully!', 'info');
}

// Enhanced notification system
function showNotification(message, type = 'success') {
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
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// File deletion handler
async function deleteFile(fileType) {
    if (!currentUser) return;

    try {
        const response = await fetch(`${API_BASE_URL}/delete-file`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + btoa(currentUser.username + ":" + currentUser.password)
            },
            body: JSON.stringify({ file_type: fileType })
        });

        if (!response.ok) {
            throw new Error('Failed to delete file');
        }

        // Update the UI
        const previewElement = document.getElementById(`${fileType}-preview`);
        if (previewElement) {
            previewElement.innerHTML = '';
        }

        // Clear the file input
        const fileInput = document.getElementById(fileType === 'resume' ? 'resume' : 'cover-letter');
        if (fileInput) {
            fileInput.value = '';
        }

        showNotification(`${fileType.replace('_', ' ')} deleted successfully`, 'success');
    } catch (error) {
        showNotification('Failed to delete file', 'error');
    }
}