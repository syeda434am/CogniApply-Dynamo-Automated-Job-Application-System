// Profile form handler
document.getElementById('profile-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Get current user from localStorage
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) {
        showNotification('Please log in again', 'error');
        return;
    }
    
    // Gather form data
    const formData = new FormData();
    
    // Required fields
    const requiredFields = {
        'full-name': 'full_name',
        'phone': 'phone',
        'dob': 'dob',
        'job-title-preference': 'job_title_preference',
        'experience-years': 'experience_years',
        'salary-range': 'salary_range',
        'skills': 'skills'
    };

    // Validate required fields
    for (const [id, paramName] of Object.entries(requiredFields)) {
        const element = document.getElementById(id);
        const value = element.value.trim();
        
        if (!value) {
            showNotification(`${id.replace(/-/g, ' ')} is required`, 'error');
            element.focus();
            return;
        }
        
        formData.append(paramName, value);
    }

    // Optional fields
    const optionalFields = {
        'linkedin-url': 'linkedin_url',
        'github-url': 'github_url',
        'portfolio-url': 'portfolio_url'
    };

    for (const [id, paramName] of Object.entries(optionalFields)) {
        const element = document.getElementById(id);
        const value = element.value.trim();
        if (value) {
            formData.append(paramName, value);
        }
    }
    
    // Add LinkedIn credentials if they exist
    const linkedinEmail = document.getElementById('linkedin-email-hidden');
    const linkedinPassword = document.getElementById('linkedin-password-hidden');
    
    if (linkedinEmail && linkedinPassword) {
        formData.append('linkedin_email', linkedinEmail.value);
        formData.append('linkedin_password', linkedinPassword.value);
    }
    
    // Handle resume file
    const resumeElement = document.getElementById('resume');
    const existingResume = document.querySelector('#resume-preview .preview-link');
    
    if (!resumeElement.files[0] && !existingResume) {
        showNotification('Resume is required', 'error');
        return;
    }
    
    if (resumeElement.files[0]) {
        formData.append('file_resume', resumeElement.files[0]);
    }
    
    // Handle cover letter file (optional)
    const coverLetterElement = document.getElementById('cover-letter');
    if (coverLetterElement.files[0]) {
        formData.append('file_cover', coverLetterElement.files[0]);
    }

    showNotification('Saving profile...', 'info');
    
    try {
        const response = await fetch('http://localhost:8000/profile', {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + btoa(currentUser.username + ":" + currentUser.password)
            },
            body: formData
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const profileData = await response.json();
        window.fetchedProfileData = profileData;

        // Update file previews immediately
        updateFilePreviews(profileData);
        
        showNotification('Profile saved successfully! 🎉', 'success');
        
        // Enable job search if profile is complete
        if (isProfileComplete()) {
            const jobSearchLink = document.querySelector('[onclick="showDashboardSection(\'job-search\')"]');
            jobSearchLink.classList.remove('disabled');
            showNotification('You can now switch to the Job Search tab!', 'success');
        }
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    }
});

// File deletion handler
async function deleteFile(fileType) {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser) {
        showNotification('Please log in again', 'error');
        return;
    }

    try {
        const response = await fetch('http://localhost:8000/delete-file', {
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

        // Update the window.fetchedProfileData
        if (window.fetchedProfileData) {
            if (fileType === 'resume') {
                delete window.fetchedProfileData.resume_url;
            } else {
                delete window.fetchedProfileData.cover_letter_url;
            }
        }

        showNotification(`${fileType.replace('_', ' ')} deleted successfully`, 'success');
    } catch (error) {
        showNotification('Failed to delete file', 'error');
    }
}

// Platform connection handlers
function connectLinkedIn() {
    const modal = document.createElement('div');
    modal.className = 'linkedin-modal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Connect LinkedIn</h3>
                <button type="button" class="modal-close">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="linkedin-email">LinkedIn Email</label>
                    <input type="email" id="linkedin-email" required>
                </div>
                <div class="form-group">
                    <label for="linkedin-password">LinkedIn Password</label>
                    <input type="password" id="linkedin-password" required>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" id="save-linkedin-btn" class="btn-primary">Connect</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.onclick = function() {
        modal.remove();
    };
    
    const saveBtn = document.getElementById('save-linkedin-btn');
    saveBtn.onclick = function() {
        const email = document.getElementById('linkedin-email').value.trim();
        const password = document.getElementById('linkedin-password').value;
        
        if (!email || !password) {
            showNotification('Please enter both email and password', 'error');
            return;
        }
        
        // Remove existing hidden fields
        const existingEmailField = document.getElementById('linkedin-email-hidden');
        if (existingEmailField) existingEmailField.remove();
        
        const existingPasswordField = document.getElementById('linkedin-password-hidden');
        if (existingPasswordField) existingPasswordField.remove();
        
        // Create and add hidden fields
        const form = document.getElementById('profile-form');
        
        const emailField = document.createElement('input');
        emailField.type = 'hidden';
        emailField.id = 'linkedin-email-hidden';
        emailField.name = 'linkedin_email';
        emailField.value = email;
        form.appendChild(emailField);
        
        const passwordField = document.createElement('input');
        passwordField.type = 'hidden';
        passwordField.id = 'linkedin-password-hidden';
        passwordField.name = 'linkedin_password';
        passwordField.value = password;
        form.appendChild(passwordField);
        
        // Update button state
        const linkedinButton = document.querySelector('.btn-platform.linkedin');
        linkedinButton.classList.add('connected');
        linkedinButton.innerHTML = '<i class="fab fa-linkedin"></i> LinkedIn Connected';
        
        modal.remove();
        showNotification('LinkedIn credentials saved! Remember to save your profile.', 'success');
    };
}

function connectIndeed() {
    showNotification('Indeed integration coming soon!', 'info');
}

// File preview update function
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

// Attach event handlers when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachButtonHandlers);
} else {
    attachButtonHandlers();
}

function attachButtonHandlers() {
    const linkedinBtn = document.querySelector('.btn-platform.linkedin');
    if (linkedinBtn) {
        linkedinBtn.onclick = connectLinkedIn;
    }
    
    const indeedBtn = document.querySelector('.btn-platform.indeed');
    if (indeedBtn) {
        indeedBtn.onclick = connectIndeed;
    }
}