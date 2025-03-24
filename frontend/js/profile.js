// Profile form handler
document.getElementById('profile-form').addEventListener('submit', function(e) {
  e.preventDefault();
  
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
          alert(`${id.replace(/-/g, ' ')} is required`);
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

  // Add optional fields if they have values
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
  if (resumeElement && resumeElement.files[0]) {
      formData.append('file_resume', resumeElement.files[0]);
  } else {
      alert('Resume is required');
      return;
  }
  
  // Handle cover letter file (optional)
  const coverLetterElement = document.getElementById('cover-letter');
  if (coverLetterElement && coverLetterElement.files[0]) {
      formData.append('file_cover', coverLetterElement.files[0]);
  }

  // Get authentication details from localStorage
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  if (!currentUser.username || !currentUser.password) {
      alert('You must be logged in to save your profile');
      return;
  }

  // Show "saving" message
  alert('Saving profile...');
  
  // Send the form data to the server
  fetch('http://localhost:8000/profile', {
      method: 'POST',
      headers: {
          'Authorization': 'Basic ' + btoa(currentUser.username + ":" + currentUser.password)
      },
      body: formData
  })
  .then(response => {
      if (!response.ok) {
          return response.text().then(text => {
              throw new Error(text || 'Failed to save profile');
          });
      }
      return response.json();
  })
  .then(data => {
      alert('Profile saved successfully! 🎉');
      // Only enable job search if at least one platform is connected
      if (document.querySelector('.btn-platform.connected')) {
          // You need to implement this function
          // showDashboardSection('job-search');
          alert('You can now search for jobs!');
      } else {
          alert('Please connect to at least one job platform before searching for jobs');
      }
  })
  .catch(error => {
      alert('Error: ' + error.message);
  });
});

// Platform connection handlers
function connectLinkedIn() {
    // Create modal container
    const modal = document.createElement('div');
    modal.className = 'linkedin-modal';
    
    // Set modal HTML content
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
    
    // Add modal to body
    document.body.appendChild(modal);
    
    // Close button event handler
    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.onclick = function() {
        modal.remove();
    };
    
    // Save button event handler
    const saveBtn = document.getElementById('save-linkedin-btn');
    saveBtn.onclick = function() {
        const email = document.getElementById('linkedin-email').value.trim();
        const password = document.getElementById('linkedin-password').value;
        
        if (!email || !password) {
            alert('Please enter both email and password');
            return;
        }
        
        // Check for existing hidden fields and remove them
        const existingEmailField = document.getElementById('linkedin-email-hidden');
        if (existingEmailField) {
            existingEmailField.remove();
        }
        
        const existingPasswordField = document.getElementById('linkedin-password-hidden');
        if (existingPasswordField) {
            existingPasswordField.remove();
        }
        
        // Create and add hidden fields to the form
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
        
        // Update button to show connected state
        const linkedinButton = document.querySelector('.btn-platform.linkedin');
        linkedinButton.classList.add('connected');
        linkedinButton.innerHTML = '<i class="fab fa-linkedin"></i> LinkedIn Connected';
        
        // Close the modal
        modal.remove();
        
        // Show confirmation
        alert('LinkedIn credentials saved! Remember to save your profile.');
    };
}

// Indeed connection handler
function connectIndeed() {
    alert('Indeed integration coming soon!');
}

// Wait for DOM to be fully loaded, then attach event handlers to platform buttons
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachButtonHandlers);
} else {
    attachButtonHandlers();
}

function attachButtonHandlers() {
    // LinkedIn button handler
    const linkedinBtn = document.querySelector('.btn-platform.linkedin');
    if (linkedinBtn) {
        linkedinBtn.onclick = connectLinkedIn;
    }
    
    // Indeed button handler
    const indeedBtn = document.querySelector('.btn-platform.indeed');
    if (indeedBtn) {
        indeedBtn.onclick = connectIndeed;
    }
}

async function connectIndeed() {
        showNotification('Indeed integration coming soon!', 'info');
}