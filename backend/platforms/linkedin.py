# linkedin_automation.py
import os
import time
import random
import asyncio
import logging
import pickle
import json
import pdfplumber
import openai
from datetime import datetime
from typing import Dict, List, Callable, Any, Optional

# Import selenium components
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from selenium.common.exceptions import (
    TimeoutException, 
    NoSuchElementException, 
    ElementClickInterceptedException,
    StaleElementReferenceException
)
import undetected_chromedriver as uc
from webdriver_manager.chrome import ChromeDriverManager

# Configure logging
logger = logging.getLogger(__name__)

class LinkedInAutomator:
    """Class to handle LinkedIn job application automation"""
    
    def __init__(
        self,
        username: str,
        resume_path: str,
        profile_data: Dict[str, Any],
        linkedin_credentials: Dict[str, str],
        headless: bool = True,
        openai_api_key: Optional[str] = None
    ):
        self.username = username
        self.resume_path = resume_path
        self.profile_data = profile_data
        self.linkedin_credentials = linkedin_credentials
        self.headless = headless
        self.driver = None
        self.cv_text = None
        
        # Set up OpenAI API key
        if openai_api_key:
            openai.api_key = openai_api_key
        else:
            openai.api_key = os.getenv("OPENAI_API_KEY")
        
        # Extract CV text
        self._extract_cv_text()
    
    def _extract_cv_text(self):
        """Extract text from resume PDF file"""
        try:
            if self.resume_path.endswith('.pdf'):
                with pdfplumber.open(self.resume_path) as pdf:
                    self.cv_text = "\n".join([page.extract_text() for page in pdf.pages if page.extract_text()])
            else:
                # For non-PDF files, we'd need additional libraries
                # This is a placeholder for docx or other formats
                logger.warning(f"Non-PDF resume format detected: {self.resume_path}")
                self.cv_text = "RESUME TEXT EXTRACTION FAILED - PLEASE UPLOAD PDF"
        except Exception as e:
            logger.error(f"Error extracting CV text: {str(e)}")
            self.cv_text = "RESUME TEXT EXTRACTION FAILED"
    
    def _initialize_driver(self):
        """Initialize and configure the WebDriver"""
        try:
            options = uc.ChromeOptions()
            
            #if self.headless:
            #    options.add_argument("--headless")
            
            # Add anti-detection options
            options.add_argument("--disable-blink-features=AutomationControlled")
            options.add_argument("--disable-extensions")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-gpu")
            
            # Add random user agent
            user_agents = [
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0"
            ]
            options.add_argument(f"--user-agent={random.choice(user_agents)}")
            
            # Initialize the driver with undetected_chromedriver
            self.driver = uc.Chrome(options=options)
            self.driver.maximize_window()
            logger.info("WebDriver initialized successfully")
            
            return True
        except Exception as e:
            logger.error(f"Error initializing WebDriver: {str(e)}")
            return False
    
    def _random_delay(self, min_sec=2, max_sec=5):
        """Add a random delay to simulate human behavior"""
        delay = random.uniform(min_sec, max_sec)
        time.sleep(delay)
    
    def _login_to_linkedin(self):
        """Log in to LinkedIn using saved cookies or credentials"""
        try:
            user_dir = os.path.join("../users", self.username)
            cookies_file = os.path.join(user_dir, "linkedin_cookies.pkl")
            
            # Navigate to LinkedIn
            self.driver.get("https://www.linkedin.com/")
            self._random_delay(3, 6)
            
            # Try to load cookies if available
            if os.path.exists(cookies_file):
                try:
                    cookies = pickle.load(open(cookies_file, "rb"))
                    for cookie in cookies:
                        self.driver.add_cookie(cookie)
                    self.driver.refresh()
                    self._random_delay(3, 6)
                    
                    # Check if login was successful
                    if "feed" in self.driver.current_url:
                        logger.info("Login successful using cookies")
                        return True
                except Exception as e:
                    logger.warning(f"Error loading cookies: {str(e)}")
            
            # If cookies didn't work or aren't available, log in with credentials
            self.driver.get("https://www.linkedin.com/login")
            self._random_delay(2, 4)
            
            # Enter username/email
            username_field = self.driver.find_element(By.ID, "username")
            username_field.clear()
            username_field.send_keys(self.linkedin_credentials["email"])
            self._random_delay(1, 2)
            
            # Enter password
            password_field = self.driver.find_element(By.ID, "password")
            password_field.clear()
            password_field.send_keys(self.linkedin_credentials["password"])
            self._random_delay(1, 2)
            
            # Submit login form
            password_field.send_keys(Keys.RETURN)
            self._random_delay(5, 8)
            
            # Check if login was successful
            if "feed" in self.driver.current_url:
                # Save cookies for future use
                pickle.dump(self.driver.get_cookies(), open(cookies_file, "wb"))
                logger.info("Login successful using credentials")
                return True
            else:
                if "checkpoint" in self.driver.current_url or "challenge" in self.driver.current_url:
                    logger.error("LinkedIn security check triggered - manual intervention required")
                else:
                    logger.error("Login failed - incorrect credentials or other issue")
                return False
        
        except Exception as e:
            logger.error(f"Error during LinkedIn login: {str(e)}")
            return False
    
    def query_gpt(self, question, options=None):
        """Query GPT to generate answers based on CV content"""
        try:
            prompt = f"""
            You are a CV analysis expert. Your task is to extract or infer answers to given questions based on the CV text provided. 

            ### **Instructions:**
            1. **Detect answer type:**
            - If the question is about **experience, salary, years, age,notice period,education or any numerical data**, return an **integer** (default to `0` if not found).
            - Otherwise, return a **short text answer**.
            
            2. **Answering the question:**
            - If the answer exists in the CV, return it.
            - If not found:
                - Return `"N/A"` for text-based questions.
                - Return `0` for numerical questions (like `experience in years`, `salary`,`Notice period`,`Education` etc.).
            
            3. **Handling Multiple-choice Questions:**
            - If **options are provided**, return the closest matching answer from the option.
            - If no exact match is found in the CV, return random answer from the option.

            ---

            ### **CV TEXT:**
            {self.cv_text}

            ### **QUESTION:**
            {question}

            ### **OPTIONS:**
            {options}

            ### **ANSWER:**
            """
            
            response = openai.chat.completions.create(
                model="gpt-4",  # Can be modified based on needs and availability
                messages=[
                    {"role": "system", "content": "You are a CV analysis expert. Answer accurately and concisely."},
                    {"role": "user", "content": prompt}
                ]
            )
            
            answer = response.choices[0].message.content.strip()
            return answer
            
        except Exception as e:
            logger.error(f"Error querying GPT: {str(e)}")
            # Return a default answer if GPT fails
            if options and isinstance(options, list) and len(options) > 0:
                return options[0]
            return "N/A"
    
    def _fill_input_fields(self):
        """Detect and fill input fields on LinkedIn application forms"""
        try:
            # Wait for input fields to be present
            WebDriverWait(self.driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "input"))
            )
            
            # Find all input and textarea fields
            input_fields = self.driver.find_elements(By.CSS_SELECTOR, "input:not([type='hidden']), textarea")
            
            for field in input_fields:
                try:
                    # Get field attributes to identify its purpose
                    placeholder = field.get_attribute("placeholder") or ""
                    aria_label = field.get_attribute("aria-label") or ""
                    name = field.get_attribute("name") or ""
                    field_id = field.get_attribute("id") or ""
                    field_type = field.get_attribute("type") or ""
                    
                    # Skip already filled fields, hidden fields, and file upload fields
                    if (field.get_attribute("value") or 
                        field_type in ["hidden", "file", "submit", "button"] or
                        not field.is_displayed()):
                        continue
                    
                    # Try to get the label text if available
                    try:
                        label = field.find_element(By.XPATH, "./preceding-sibling::label").text
                    except:
                        label = ""
                    
                    # Combine all identifiers to create a comprehensive description
                    field_identifier = (placeholder + " " + aria_label + " " + name + " " + label + " " + field_id).strip().lower()
                    
                    # Skip empty or irrelevant fields
                    if not field_identifier or field_identifier in ["null", "undefined"]:
                        continue
                    
                    # Scroll to the element
                    self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", field)
                    self._random_delay(0.5, 1)
                    
                    # Click and clear the field
                    field.click()
                    field.clear()
                    self._random_delay(0.3, 0.8)
                    
                    # Get the appropriate value from GPT
                    answer = self.query_gpt(field_identifier)
                    logger.info(f"Field: {field_identifier} -> Answer: {answer}")
                    
                    # Type the answer with human-like behavior
                    for char in answer:
                        field.send_keys(char)
                        self._random_delay(0.05, 0.15)
                    
                    self._random_delay(0.5, 1)
                
                except StaleElementReferenceException:
                    # Element became stale, continue with next element
                    continue
                except Exception as e:
                    logger.warning(f"Error filling field: {str(e)}")
            
            logger.info("Input fields filled successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error filling input fields: {str(e)}")
            return False
    
    def _fill_radio_buttons(self):
        """Fill radio button questions on LinkedIn application forms"""
        try:
            # Look for radio button fieldsets
            radio_fieldsets = self.driver.find_elements(
                By.XPATH, "//fieldset[@data-test-form-builder-radio-button-form-component='true']"
            )
            
            if not radio_fieldsets:
                radio_fieldsets = self.driver.find_elements(
                    By.XPATH, "//fieldset[.//input[@type='radio']]"
                )
            
            for fieldset in radio_fieldsets:
                try:
                    # Extract the question
                    try:
                        question_element = fieldset.find_element(By.XPATH, ".//legend/span")
                        question_text = question_element.text.strip()
                    except:
                        try:
                            question_element = fieldset.find_element(By.XPATH, ".//legend")
                            question_text = question_element.text.strip()
                        except:
                            # If no question found, generate a generic one
                            question_text = "Choose the most appropriate option for this application"
                    
                    # Extract radio options
                    radio_labels = fieldset.find_elements(By.TAG_NAME, "label")
                    radio_options = [label.text.strip() for label in radio_labels if label.text.strip()]
                    
                    # Handle special cases like Yes/No buttons
                    yes_no_options = fieldset.find_elements(By.XPATH, ".//div[@data-test-text-selectable-option]")
                    if yes_no_options and not radio_options:
                        radio_options = ["Yes", "No"]
                    
                    if not radio_options:
                        continue
                    
                    # Query GPT for the best answer
                    best_answer = self.query_gpt(question_text, radio_options).lower().strip()
                    logger.info(f"Radio Question: {question_text} -> Answer: {best_answer}")
                    
                    # Find the closest matching option
                    to_select = None
                    for i, label in enumerate(radio_labels):
                        if best_answer in label.text.lower():
                            to_select = radio_labels[i]
                            break
                    
                    # Default to first option if no match found
                    if not to_select and radio_labels:
                        to_select = radio_labels[0]
                    
                    # Click the selected option
                    if to_select:
                        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", to_select)
                        self._random_delay(0.5, 1)
                        to_select.click()
                        self._random_delay(1, 2)
                
                except Exception as e:
                    logger.warning(f"Error processing radio button fieldset: {str(e)}")
            
            logger.info("Radio buttons filled successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error filling radio buttons: {str(e)}")
            return False
    
    def _fill_dropdowns(self):
        """Fill dropdown select fields on LinkedIn application forms"""
        try:
            # Find all dropdown containers
            dropdown_containers = self.driver.find_elements(
                By.CSS_SELECTOR, "div[data-test-text-entity-list-form-component], select"
            )
            
            for container in dropdown_containers:
                try:
                    # Try to get the label/question
                    try:
                        # If it's a container with a label
                        label_element = container.find_element(By.TAG_NAME, "label")
                        question_text = label_element.text.strip()
                        select_element = container.find_element(By.TAG_NAME, "select")
                    except:
                        # If it's a direct select element
                        if container.tag_name == "select":
                            select_element = container
                            try:
                                label_element = self.driver.find_element(
                                    By.XPATH, f"//label[@for='{select_element.get_attribute('id')}']"
                                )
                                question_text = label_element.text.strip()
                            except:
                                question_text = "Select the most appropriate option"
                        else:
                            continue
                    
                    # Extract options
                    options = select_element.find_elements(By.TAG_NAME, "option")
                    option_texts = [
                        option.text.strip() for option in options 
                        if option.text.strip() and option.text.strip().lower() not in ["select an option", "please select"]
                    ]
                    
                    if not option_texts:
                        continue
                    
                    # Query GPT for the best answer
                    best_answer = self.query_gpt(question_text, option_texts)
                    logger.info(f"Dropdown Question: {question_text} -> Answer: {best_answer}")
                    
                    # Select the answer
                    self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", select_element)
                    self._random_delay(0.5, 1)
                    
                    # Create a Select object
                    select = Select(select_element)
                    
                    # Try to select by visible text
                    try:
                        if best_answer in option_texts:
                            select.select_by_visible_text(best_answer)
                        else:
                            # Fall back to first option if best answer not found
                            select.select_by_visible_text(option_texts[0])
                    except:
                        select.select_by_index(1)  # Skip the "Select an option" placeholder
                except Exception as e:
                    logger.warning(f"Error selecting dropdown option: {str(e)}")
            
            logger.info("Dropdown fields filled successfully")
            return True
        
        except Exception as e:
            logger.error(f"Error filling dropdown fields: {str(e)}")
            return False
    
    def _upload_resume(self):
        """Upload resume to the application if required"""
        try:
            # Find all file upload inputs
            file_inputs = self.driver.find_elements(By.XPATH, "//input[@type='file']")
            
            if not file_inputs:
                logger.info("No file upload fields found")
                return True
            
            for file_input in file_inputs:
                try:
                    if not file_input.is_displayed():
                        continue
                    
                    # Scroll to the element
                    self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", file_input)
                    self._random_delay(1, 2)
                    
                    # Send the resume file path
                    file_input.send_keys(self.resume_path)
                    self._random_delay(2, 4)
                    
                    logger.info(f"Resume uploaded: {self.resume_path}")
                
                except Exception as e:
                    logger.warning(f"Error uploading resume to input: {str(e)}")
            
            return True
        
        except Exception as e:
            logger.error(f"Error uploading resume: {str(e)}")
            return False
    
    def _click_button(self, button_texts):
        """Find and click a button with specific text"""
        try:
            # Get all buttons
            buttons = self.driver.find_elements(By.TAG_NAME, "button")
            
            for button in buttons:
                button_text = button.text.lower()
                
                # Check if the button text contains any of the target texts
                if any(text.lower() in button_text for text in button_texts):
                    # Make sure button is visible and clickable
                    if button.is_displayed() and button.is_enabled():
                        # Scroll into view
                        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", button)
                        self._random_delay(1, 2)
                        
                        # Click the button
                        button.click()
                        self._random_delay(2, 3)
                        
                        logger.info(f"Clicked button: {button_text}")
                        return True
            
            logger.warning(f"No buttons found with text: {button_texts}")
            return False
        
        except Exception as e:
            logger.error(f"Error clicking button: {str(e)}")
            return False
    
    def _close_popup(self):
        """Close any popup dialogs that might appear"""
        try:
            # Find potential popup elements
            popup_elements = [
                (By.CLASS_NAME, "artdeco-modal__dismiss"),  # LinkedIn's dismiss button
                (By.XPATH, "//button[contains(@class, 'modal-close-btn')]"),
                (By.XPATH, "//button[.//span[text()='Dismiss']]"),
                (By.XPATH, "//button[.//span[text()='Not now']]"),
                (By.XPATH, "//button[.//span[text()='Close']]")
            ]
            
            for selector_type, selector in popup_elements:
                try:
                    elements = self.driver.find_elements(selector_type, selector)
                    if elements:
                        for element in elements:
                            if element.is_displayed() and element.is_enabled():
                                element.click()
                                self._random_delay(1, 2)
                                logger.info(f"Closed popup using selector: {selector}")
                                return True
                except:
                    continue
            
            # If no specific close buttons found, try pressing escape key
            try:
                actions = ActionChains(self.driver)
                actions.send_keys(Keys.ESCAPE)
                actions.perform()
                self._random_delay(1, 2)
                logger.info("Pressed ESC key to close popup")
                return True
            except:
                pass
            
            return False
        
        except Exception as e:
            logger.error(f"Error closing popup: {str(e)}")
            return False
    
    async def apply_to_jobs(self, job_title, location, limit=5, status_callback=None):
        """
        Apply to jobs with the specified title and location
        
        Args:
            job_title: The job title to search for
            location: The location to search in
            limit: Maximum number of applications to submit
            status_callback: Async function to call with status updates
        
        Returns:
            List of jobs applied to
        """
        if not self._initialize_driver():
            raise Exception("Failed to initialize WebDriver")
        
        try:
            # Login to LinkedIn
            if not self._login_to_linkedin():
                raise Exception("LinkedIn login failed")
            
            # Search for jobs
            search_url = f"https://www.linkedin.com/jobs/search/?keywords={job_title}&location={location}"
            self.driver.get(search_url)
            self._random_delay(3, 5)
            
            if status_callback:
                await status_callback(f"Searching for {job_title} jobs in {location}")
            
            # Track jobs we've applied to
            applied_jobs = []
            
            # Keep track of jobs we've already seen
            seen_job_ids = set()
            
            while len(applied_jobs) < limit:
                # Get all job cards
                job_cards = self.driver.find_elements(By.CSS_SELECTOR, ".job-card-container")
                
                if not job_cards:
                    logger.warning("No job listings found")
                    break
                
                # Process each job card
                for job_card in job_cards:
                    # Check if we've reached the limit
                    if len(applied_jobs) >= limit:
                        break
                    
                    try:
                        # Get job ID to track seen jobs
                        job_id = job_card.get_attribute("data-job-id")
                        if not job_id:
                            job_id = job_card.get_attribute("id")
                        
                        # Skip if we've already seen this job
                        if job_id in seen_job_ids:
                            continue
                        
                        seen_job_ids.add(job_id)
                        
                        # Extract job title and company
                        try:
                            job_title_elem = job_card.find_element(By.CSS_SELECTOR, ".job-card-list__title")
                            job_title_text = job_title_elem.text.strip()
                            
                            company_elem = job_card.find_element(By.CSS_SELECTOR, ".job-card-container__company-name")
                            company_name = company_elem.text.strip()
                        except:
                            job_title_text = "Unknown Position"
                            company_name = "Unknown Company"
                        
                        if status_callback:
                            await status_callback(f"Attempting to apply to: {job_title_text} at {company_name}")
                        
                        # Click on the job card to view details
                        job_card.click()
                        self._random_delay(2, 4)
                        
                        # Look for the "Easy Apply" button
                        try:
                            easy_apply_button = WebDriverWait(self.driver, 5).until(
                                EC.element_to_be_clickable((By.CSS_SELECTOR, ".jobs-apply-button"))
                            )
                            
                            # Check if it's actually an Easy Apply button
                            if "easy apply" not in easy_apply_button.text.lower():
                                logger.info(f"Not an Easy Apply job: {job_title_text}")
                                continue
                            
                            # Click the Easy Apply button
                            easy_apply_button.click()
                            self._random_delay(2, 3)
                            
                            # Application process
                            application_complete = False
                            form_page = 1
                            
                            while not application_complete:
                                if status_callback:
                                    await status_callback(f"Filling out application form (page {form_page}) for {job_title_text}")
                                
                                # Fill all form components
                                self._fill_input_fields()
                                self._fill_radio_buttons()
                                self._fill_dropdowns()
                                self._upload_resume()
                                
                                # Check for Next/Review/Submit buttons
                                if self._click_button(["Submit application", "Submit"]):
                                    self._random_delay(3, 5)
                                    application_complete = True
                                elif self._click_button(["Review", "Next", "Continue"]):
                                    self._random_delay(2, 4)
                                    form_page += 1
                                else:
                                    # No recognizable button found, try to complete anyway
                                    logger.warning("No next/submit button found, attempting to close dialog")
                                    application_complete = True
                                
                                # Handle any popups
                                self._close_popup()
                            
                            # Record the successful application
                            application_record = {
                                "job_id": job_id,               # the job's unique ID
                                "jobTitle": job_title_text,     # the job title (for example, "Software Engineer")
                                "company": company_name,        # the company name
                                "status": "Applied",            # the status, e.g., "Applied"
                                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            }
                            
                            applied_jobs.append(application_record)
                            
                            if status_callback:
                                await status_callback(f"Successfully applied to {job_title_text} at {company_name}")
                        
                        except TimeoutException:
                            logger.info(f"No Easy Apply button found for job: {job_title_text}")
                            continue
                        
                        except Exception as e:
                            logger.warning(f"Error applying to job {job_title_text}: {str(e)}")
                            continue
                    
                    except Exception as e:
                        logger.warning(f"Error processing job card: {str(e)}")
                        continue
                
                # If we haven't reached the limit yet, try to load more jobs
                if len(applied_jobs) < limit:
                    # Scroll down to load more jobs
                    self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                    self._random_delay(3, 5)
                    
                    # Click "Show more jobs" button if available
                    try:
                        show_more = self.driver.find_element(By.CSS_SELECTOR, ".infinite-scroller__show-more-button")
                        if show_more.is_displayed():
                            show_more.click()
                            self._random_delay(3, 5)
                    except:
                        # If we can't find more jobs, break the loop
                        if len(job_cards) == len(seen_job_ids):
                            logger.info("No more jobs to process")
                            break
            
            return {"jobs": applied_jobs}
        
        except Exception as e:
            logger.error(f"Error in job application process: {str(e)}")
            raise
        
        finally:
            # Clean up the WebDriver
            if self.driver:
                self.driver.quit()