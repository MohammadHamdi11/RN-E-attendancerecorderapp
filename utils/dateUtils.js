// Helper function to format dates consistently
export const formatDate = (date, includeTime = false) => {
  if (!date) return '';
  
  try {
    const dateObj = new Date(date);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    
    let result = `${day}/${month}/${year}`;
    
    if (includeTime) {
      const hours = String(dateObj.getHours()).padStart(2, '0');
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      result += ` ${hours}:${minutes}`;
    }
    
    return result;
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};