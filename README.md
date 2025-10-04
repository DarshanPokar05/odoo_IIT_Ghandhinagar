Demo Video Link : https://drive.google.com/file/d/10jGnQx43ZNrfORcjKGdWN91pLFGLEyQz/view?usp=sharing

.env 

PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=expense_management
DB_USER=postgres
DB_PASSWORD=password

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# External APIs
EXCHANGE_RATE_API_URL=https://api.exchangerate-api.com/v4/latest
COUNTRIES_API_URL=https://restcountries.com/v3.1/all?fields=name,currencies

# File Upload Configuration
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=5242880

# OCR Configuration
OCR_CONFIDENCE_THRESHOLD=0.7
