const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');

class OCRService {
  constructor() {
    this.confidenceThreshold = parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD) || 0.7;
  }

  async preprocessImage(imagePath) {
    try {
      const processedPath = path.join(path.dirname(imagePath), 'processed_' + path.basename(imagePath));
      
      await sharp(imagePath)
        .resize(2000, null, { withoutEnlargement: true })
        .normalize()
        .sharpen()
        .png()
        .toFile(processedPath);
        
      return processedPath;
    } catch (error) {
      console.error('Image preprocessing error:', error);
      return imagePath; // Return original if preprocessing fails
    }
  }

  async extractTextFromImage(imagePath) {
    try {
      const processedPath = await this.preprocessImage(imagePath);
      
      const { data: { text, confidence } } = await Tesseract.recognize(
        processedPath,
        'eng',
        {
          logger: m => console.log(m)
        }
      );

      return {
        text: text.trim(),
        confidence: confidence / 100 // Convert to 0-1 scale
      };
    } catch (error) {
      console.error('OCR extraction error:', error);
      throw new Error('Failed to extract text from image');
    }
  }

  parseReceiptData(text) {
    const result = {
      amount: null,
      date: null,
      merchant: null,
      category: null
    };

    // Extract amount (look for currency symbols and decimal patterns)
    const amountRegex = /(?:[$€£¥₹]|USD|EUR|GBP|JPY|INR)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
    const amountMatches = text.match(amountRegex);
    if (amountMatches && amountMatches.length > 0) {
      // Take the largest amount found (likely the total)
      const amounts = amountMatches.map(match => {
        const numStr = match.replace(/[^0-9.]/g, '');
        return parseFloat(numStr);
      }).filter(num => !isNaN(num));
      
      if (amounts.length > 0) {
        result.amount = Math.max(...amounts);
      }
    }

    // Extract date (various formats)
    const dateRegex = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/g;
    const dateMatch = text.match(dateRegex);
    if (dateMatch && dateMatch.length > 0) {
      result.date = this.parseDate(dateMatch[0]);
    }

    // Extract merchant name (usually at the top of receipt)
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 0) {
      // Take first non-empty line as potential merchant name
      const firstLine = lines[0].trim();
      if (firstLine.length > 2 && firstLine.length < 50) {
        result.merchant = firstLine;
      }
    }

    // Categorize based on keywords
    result.category = this.categorizeExpense(text);

    return result;
  }

  parseDate(dateStr) {
    try {
      // Try different date formats
      const formats = [
        /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/,  // MM/DD/YYYY or DD/MM/YYYY
        /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/   // YYYY/MM/DD
      ];

      for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
          const [, part1, part2, part3] = match;
          
          // Assume YYYY/MM/DD if first part is 4 digits
          if (part1.length === 4) {
            return new Date(parseInt(part1), parseInt(part2) - 1, parseInt(part3));
          } else {
            // Assume MM/DD/YYYY (US format) - could be enhanced with locale detection
            return new Date(parseInt(part3), parseInt(part1) - 1, parseInt(part2));
          }
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  categorizeExpense(text) {
    const categories = {
      'Food': ['restaurant', 'cafe', 'food', 'dining', 'meal', 'lunch', 'dinner', 'breakfast', 'pizza', 'burger'],
      'Travel': ['taxi', 'uber', 'lyft', 'flight', 'airline', 'train', 'bus', 'transport', 'fuel', 'gas'],
      'Accommodation': ['hotel', 'motel', 'inn', 'lodge', 'accommodation', 'booking', 'airbnb'],
      'Office Supplies': ['office', 'supplies', 'stationery', 'paper', 'pen', 'computer', 'software'],
      'Entertainment': ['entertainment', 'movie', 'theater', 'concert', 'event', 'tickets'],
      'Training': ['training', 'course', 'seminar', 'workshop', 'conference', 'education']
    };

    const lowerText = text.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerText.includes(keyword))) {
        return category;
      }
    }
    
    return 'Other';
  }

  async processReceipt(imagePath) {
    try {
      const { text, confidence } = await this.extractTextFromImage(imagePath);
      
      if (confidence < this.confidenceThreshold) {
        console.warn(`Low OCR confidence: ${confidence}`);
      }

      const parsedData = this.parseReceiptData(text);
      
      return {
        ...parsedData,
        rawText: text,
        confidence,
        success: true
      };
    } catch (error) {
      console.error('Receipt processing error:', error);
      return {
        amount: null,
        date: null,
        merchant: null,
        category: null,
        rawText: '',
        confidence: 0,
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new OCRService();