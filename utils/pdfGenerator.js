// utils/pdfGenerator.js
import PDFDocument from 'pdfkit';

export const generateInvoicePDF = (invoice, branch) => {
    const doc = new PDFDocument({ margin: 50 });

    // Header - Brand Name & Branch Details
    doc.fillColor("#222222")
       .font("Helvetica-Bold")
       .fontSize(20)
       .text(branch.name.toUpperCase(), 50, 50)
       .fontSize(10)
       .text(branch.address, 50, 80)
       .text(`Phone: ${branch.phone}`, 50, 95)
       .moveDown();

    // Invoice Title & Meta Data
    doc.fillColor("#000000")
       .fontSize(25)
       .text("INVOICE", 50, 160, { align: 'right' });
    
    doc.fontSize(10)
       .text(`Invoice Number: ${invoice.invoiceNumber}`, 50, 190, { align: 'right' })
       .text(`Date: ${new Date(invoice.createdAt).toLocaleDateString()}`, 50, 205, { align: 'right' })
       .moveDown();

    // Table Header
    const tableTop = 270;
    doc.font("Helvetica-Bold");
    generateTableRow(doc, tableTop, "Service", "Qty", "Price", "Total");
    generateHr(doc, tableTop + 20);
    doc.font("Helvetica");

    // Table Rows (The Laundry Items)
    let i;
    for (i = 0; i < invoice.items.length; i++) {
        const item = invoice.items[i];
        const position = tableTop + 30 + (i * 30);
        generateTableRow(
            doc, 
            position, 
            item.description, 
            item.quantity, 
            item.unitPrice.toFixed(2), 
            item.total.toFixed(2)
        );
    }

    // Footer - Totals
    const subtotalPosition = tableTop + 30 + (i * 30) + 20;
    doc.font("Helvetica-Bold")
       .text(`Grand Total: $${invoice.totalAmount.toFixed(2)}`, 50, subtotalPosition, { align: 'right' });

    doc.end();
    return doc;
};

// Helper function for rows
function generateTableRow(doc, y, item, qty, price, total) {
    doc.fontSize(10)
       .text(item, 50, y)
       .text(qty, 280, y, { width: 90, align: "right" })
       .text(price, 370, y, { width: 90, align: "right" })
       .text(total, 480, y, { width: 90, align: "right" });
}

function generateHr(doc, y) {
    doc.strokeColor("#666666")
       .lineWidth(1)
       .moveTo(50, y)
       .lineTo(550, y)
       .stroke();
}