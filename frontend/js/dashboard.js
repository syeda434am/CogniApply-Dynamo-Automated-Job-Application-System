window.showDashboardSection = showDashboardSection;
window.isProfileComplete = isProfileComplete;
window.showProfileCompletionPopup = showProfileCompletionPopup;
window.closePopup = closePopup;
window.goToProfile = goToProfile;
window.deleteFile = deleteFile;

// Dashboard section management
function showDashboardSection(sectionId) {
  // Save the current section
  localStorage.setItem('lastSection', sectionId);

  if (sectionId === 'job-search' && !isProfileComplete()) {
      showProfileCompletionPopup();
      return;
  }

  document.querySelectorAll('.nav-links a').forEach(link => {
      link.classList.remove('active');
  });
  document.querySelector(`[onclick="showDashboardSection('${sectionId}')"]`).classList.add('active');

  document.querySelectorAll('.dashboard-section').forEach(section => {
      section.classList.add('hidden');
  });
  document.getElementById(`${sectionId}-section`).classList.remove('hidden');
}

function isProfileComplete() {
  // Check if we have profile data in the window object
  if (window.fetchedProfileData) {
      const pd = window.fetchedProfileData;
      const hasRequiredFields = pd.full_name && 
                              pd.phone && 
                              pd.job_title_preference && 
                              pd.experience_years && 
                              pd.skills;
      
      // Check for resume (either in preview or file input)
      const hasResume = pd.resume_url || document.getElementById('resume').files.length > 0;
      
      // Check for LinkedIn connection
      const hasLinkedIn = pd.linkedin_email && pd.linkedin_password;
      
      return hasRequiredFields && hasResume && hasLinkedIn;
  }
  return false;
}

function showProfileCompletionPopup() {
  const popup = document.getElementById('profile-completion-popup');
  popup.classList.remove('hidden');
  popup.classList.add('show');
}

function closePopup() {
  const popup = document.getElementById('profile-completion-popup');
  popup.classList.remove('show');
  setTimeout(() => popup.classList.add('hidden'), 300);
}

function goToProfile() {
  closePopup();
  showDashboardSection('profile');
}

let websocket = null;

// In dashboard.js
function connectWebSocket(username) {
    // Ensure the username is properly encoded for URLs
    const encodedUsername = encodeURIComponent(username);
    websocket = new WebSocket(`ws://localhost:8000/ws/${encodedUsername}`);
  
    websocket.onopen = () => {
      console.log('WebSocket connection established');
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      showNotification('WebSocket connection failed. Some real-time features may not work.', 'error');
    };

    websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message received:', data); // Add logging
        
        switch (data.type) {
          case 'status':
            updateAutomationStatus(data.message);
            updateProgressBar(data.message);
            break;
          case 'complete':
            handleAutomationComplete(data);
            break;
          case 'error':
            showNotification(data.message, 'error');
            resetAutomationUI();
            break;
          case 'heartbeat':
            // Ignore heartbeat messages
            break;
        }
    };
}

function handleAutomationComplete(data) {
  // Hide loading indicators
  const loadingBar = document.querySelector('.loading-bar');
  if (loadingBar) {
      loadingBar.style.display = 'none';
  }
  
  // Get the jobs list container and clear its content
  const jobsListEl = document.getElementById('jobs-list');
  jobsListEl.innerHTML = '';
  
  if (data.results && data.results.jobs && data.results.jobs.length > 0) {
      displayAutomationResults({
          totalJobs: data.results.jobs.length,
          appliedJobs: data.results.jobs.length,
          applications: data.results.jobs,
          successRate: 100
      });
  } else {
      jobsListEl.innerHTML = `
          <div class="automation-summary">
              <div class="summary-header">
                  <h3>Automation Complete</h3>
                  <p class="timestamp">${new Date().toLocaleString()}</p>
              </div>
              <div class="no-results">
                  <i class="fas fa-info-circle"></i>
                  <p>No matching jobs were found. Please try different search criteria.</p>
              </div>
          </div>
      `;
  }
  
  resetAutomationUI();
}

function updateAutomationStatus(message) {
    const statusMessage = document.querySelector('.status-message');
    if (statusMessage) {
      statusMessage.textContent = message;
    }
}

function updateProgressBar(message) {
    const progressBar = document.querySelector('.loading-progress');
    
    if (message.includes("Searching for")) {
      progressBar.style.width = '10%';
      updateStepIndicators('searching');
    } else if (message.includes("Attempting to apply")) {
      progressBar.style.width = '30%';
      updateStepIndicators('applying');
    } else if (message.includes("Filling out application")) {
      progressBar.style.width = '60%';
      updateStepIndicators('applying');
    } else if (message.includes("Successfully applied")) {
      const currentWidth = parseInt(progressBar.style.width || '0');
      const newWidth = Math.min(currentWidth + 10, 90);
      progressBar.style.width = `${newWidth}%`;
    } else if (message.includes("completed") || message.includes("No more jobs")) {
      progressBar.style.width = '100%';
      updateStepIndicators('completed');
    }
}
  
function updateStepIndicators(stage) {
    const steps = document.querySelectorAll('.step-indicator');
    steps.forEach(step => step.classList.remove('active', 'completed'));
    
    switch(stage) {
      case 'searching':
        steps[0].classList.add('active');
        break;
      case 'applying':
        steps[0].classList.add('completed');
        steps[1].classList.add('active');
        break;
      case 'completed':
        steps[0].classList.add('completed');
        steps[1].classList.add('completed');
        steps[2].classList.add('active');
        break;
    }
}


// Job search form handler
// Job search form handler
document.getElementById('job-search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Get user credentials from localStorage
  const currentUser = JSON.parse(localStorage.getItem('currentUser'));
  if (!currentUser) {
      showNotification('Please log in again', 'error');
      return;
  }

  const jobTitle = document.getElementById('job-title').value.trim();
  const location = document.getElementById('location').value.trim();
  const platform = document.getElementById('platform').value;
  
  if (!jobTitle || !location || !platform) {
      showNotification('Please fill in all required fields', 'error');
      return;
  }

  const searchButton = e.target.querySelector('button[type="submit"]');
  const originalButtonText = searchButton.innerHTML;
  searchButton.disabled = true;
  searchButton.innerHTML = '<i class="fas fa-robot fa-spin"></i> Starting Automation...';

  try {
      document.getElementById('search-results').classList.remove('hidden');
      document.getElementById('jobs-list').innerHTML = `
          <div class="automation-progress">
              <div class="progress-step">
                  <div class="step-indicator searching active">
                      <i class="fas fa-search"></i>
                  </div>
                  <p>Searching Jobs</p>
              </div>
              <div class="progress-step">
                  <div class="step-indicator">
                      <i class="fas fa-robot"></i>
                  </div>
                  <p>Applying to Jobs</p>
              </div>
              <div class="progress-step">
                  <div class="step-indicator">
                      <i class="fas fa-check-circle"></i>
                  </div>
                  <p>Completing Applications</p>
              </div>
          </div>
          <div class="progress-details">
              <p class="status-message">Initializing automation...</p>
              <div class="loading-bar"><div class="loading-progress" style="width: 0%"></div></div>
          </div>
      `;

      // Connect WebSocket before starting automation
      connectWebSocket(currentUser.username);

      const response = await fetch('http://localhost:8000/apply', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Basic ' + btoa(currentUser.username + ":" + currentUser.password)
          },
          body: JSON.stringify({
              job_title: jobTitle,
              location: location,
              applications_limit: 5
          })
      });

      if (!response.ok) {
          throw new Error(await response.text());
      }

      showNotification('Job search automation started. Results will appear as jobs are processed.');

  } catch (error) {
      showNotification('Automation failed to start: ' + error.message, 'error');
      resetAutomationUI();
  }
});

function resetAutomationUI() {
    const searchButton = document.querySelector('#job-search-form button[type="submit"]');
    if (searchButton) {
        searchButton.disabled = false;
        searchButton.innerHTML = '<i class="fas fa-search"></i> Search Jobs';
    }
}

function displayAutomationResults(results) {
    const jobsList = document.getElementById('jobs-list');
    
    // Create summary section
    const summary = document.createElement('div');
    summary.className = 'automation-summary';
    summary.innerHTML = `
      <div class="summary-header">
        <h3>Automation Complete</h3>
        <p class="timestamp">${new Date().toLocaleString()}</p>
      </div>
      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-value">${results.totalJobs}</span>
          <span class="stat-label">Jobs Found</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${results.appliedJobs}</span>
          <span class="stat-label">Applications Submitted</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${results.successRate}%</span>
          <span class="stat-label">Success Rate</span>
        </div>
      </div>
    `;

    // Create detailed results section
    const details = document.createElement('div');
    details.className = 'automation-details';
    
    if (results.applications && results.applications.length > 0) {
      details.innerHTML = `
        <h4>Application Details</h4>
        <div class="applications-list">
          ${results.applications.map(app => `
            <div class="application-item ${app.status.toLowerCase()}">
              <div class="application-info">
                <h5>${app.jobTitle}</h5>
                <p class="company">${app.company}</p>
                <p class="timestamp">${app.timestamp}</p>
              </div>
              <div class="application-status">
                <span class="status-badge ${app.status.toLowerCase()}">
                  <i class="fas fa-${app.status === 'Applied' ? 'check' : 'times'}"></i>
                  ${app.status}
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      details.innerHTML = `
        <div class="no-results">
          <i class="fas fa-info-circle"></i>
          <p>No applications were submitted. This might be because no matching jobs were found or the jobs required manual application.</p>
        </div>
      `;
    }

    jobsList.innerHTML = '';
    jobsList.appendChild(summary);
    jobsList.appendChild(details);
}

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

// Initialize dashboard styles
document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
        .automation-progress {
            display: flex;
            justify-content: space-between;
            margin: 2rem 0;
            position: relative;
            padding: 0 2rem;
        }

        .automation-progress::before {
            content: '';
            position: absolute;
            top: 25px;
            left: 50px;
            right: 50px;
            height: 2px;
            background: #e5e7eb;
            z-index: 0;
        }

        .progress-step {
            text-align: center;
            position: relative;
            z-index: 1;
        }

        .step-indicator {
            width: 50px;
            height: 50px;
            background: white;
            border: 2px solid #e5e7eb;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 0.5rem;
            transition: all 0.3s ease;
        }

        .step-indicator.active {
            border-color: var(--primary-color);
            color: var(--primary-color);
        }

        .step-indicator.completed {
            background: var(--primary-color);
            border-color: var(--primary-color);
            color: white;
        }

        .progress-details {
            text-align: center;
            margin: 2rem 0;
        }

        .loading-bar {
            height: 4px;
            background: #e5e7eb;
            border-radius: 2px;
            margin: 1rem auto;
            width: 100%;
            max-width: 400px;
            overflow: hidden;
        }

        .loading-progress {
            height: 100%;
            background: var(--primary-color);
            width: 0;
            transition: width 0.3s ease;
        }

        .automation-summary {
            background: white;
            border-radius: 0.5rem;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .summary-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 1rem;
            margin-top: 1rem;
        }

        .stat-item {
            text-align: center;
            padding: 1rem;
            background: #f9fafb;
            border-radius: 0.5rem;
        }

        .stat-value {
            display: block;
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--primary-color);
        }

        .stat-label {
            font-size: 0.875rem;
            color: #6b7280;
        }

        .applications-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
            margin-top: 1rem;
        }

        .application-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1rem;
            background: white;
            border-radius: 0.5rem;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            font-size: 0.875rem;
        }

        .status-badge.applied {
            background: #dcfce7;
            color: #16a34a;
        }

        .status-badge.failed {
            background: #fee2e2;
            color: #dc2626;
        }

        .no-results {
            text-align: center;
            padding: 2rem;
            background: #f9fafb;
            border-radius: 0.5rem;
            color: #6b7280;
        }

        .no-results i {
            font-size: 2rem;
            margin-bottom: 1rem;
            color: var(--primary-color);
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .fa-spin {
            animation: spin 1s linear infinite;
        }
    `;
    document.head.appendChild(style);
});