import * as XLSX from 'xlsx';

/**
 * Applies password protection to an Excel workbook to prevent editing (view-only mode)
 * 
 * @param {XLSX.WorkBook} workbook - The XLSX workbook object to protect
 * @param {string} password - The password to protect the workbook with (defaults to hardcoded password)
 * @returns {XLSX.WorkBook} - The protected workbook
 */
export const protectWorkbook = (workbook, password = "medasuexportpass11") => {
  try {
    console.log("Applying Excel protection...");
    
    // Make sure we have a valid workbook
    if (!workbook || typeof workbook !== 'object' || !workbook.SheetNames) {
      console.error("Invalid workbook provided to protectWorkbook");
      return workbook; // Return original workbook if invalid
    }

    // Add workbook protection
    if (!workbook.Workbook) workbook.Workbook = {};
    if (!workbook.Workbook.WBProps) workbook.Workbook.WBProps = {};
    
    // Set workbook protection properties
    workbook.Workbook.WBProps.workbookPassword = password;
    workbook.Workbook.WBProps.readOnlyRecommended = true;
    
    // Protect all sheets in the workbook
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      
      // Initialize sheet protection options
      if (!sheet['!protect']) {
        sheet['!protect'] = {};
      }
      
      // Apply sheet protection settings
      sheet['!protect'] = {
        password: password,         // Sheet password
        sheet: true,                // Protect worksheet and contents
        objects: true,              // Protect objects
        scenarios: true,            // Protect scenarios
        formatCells: false,         // Prevent format cells
        formatColumns: false,       // Prevent format columns
        formatRows: false,          // Prevent format rows
        insertColumns: false,       // Prevent insert columns
        insertRows: false,          // Prevent insert rows
        insertHyperlinks: false,    // Prevent insert hyperlinks
        deleteColumns: false,       // Prevent delete columns
        deleteRows: false,          // Prevent delete rows
        sort: false,                // Prevent sort
        autoFilter: false,          // Prevent auto filter
        pivotTables: false          // Prevent pivot tables
      };
    });
    
    console.log(`Excel protection applied to ${workbook.SheetNames.length} sheets`);
    return workbook;
  } catch (error) {
    console.error("Error applying Excel protection:", error);
    // Return the original workbook if protection fails
    return workbook;
  }
};

/**
 * Creates a protected version of a workbook output
 * 
 * @param {XLSX.WorkBook} workbook - The workbook to protect
 * @param {object} options - XLSX write options
 * @returns {string} - The protected workbook data as a string (binary or base64)
 */
export const writeProtectedWorkbook = (workbook, options = { type: 'base64', bookType: 'xlsx' }) => {
  try {
    // Apply protection to the workbook
    const protectedWorkbook = protectWorkbook(workbook);
    
    // Write the protected workbook
    return XLSX.write(protectedWorkbook, options);
  } catch (error) {
    console.error("Error creating protected workbook:", error);
    // Fallback to unprotected workbook if protection fails
    return XLSX.write(workbook, options);
  }
};