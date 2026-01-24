// export const parseUPIText = (rawText: string): TransactionData => {
//   // 1. PRE-CLEANING (Critical Step)
  
//   // A. Fix 'Z' or leading '7' misdetected for Rupee symbol
//   let cleanText = rawText
//     .replace(/\bZ(?=\d)/gi, '') 
//     .replace(/(^|\s)7(?=\d{2,})/g, '$1'); // Only strips '7' if leading a long number

//   // B. UPI ID (VPA) PURGE - New!
//   // This removes anything like "660452.rpz@xaxis" or "9876543210@paytm"
//   // It looks for non-whitespace characters surrounding an @ symbol.
//   cleanText = cleanText.replace(/\S+@\S+/g, '[VPA_REMOVED]');

//   // C. Remove Bank Account / Card Numbers (e.g., "XX4567" or "A/c ...1234")
//   cleanText = cleanText.replace(/(?:A\/c|Acc|Card|XX|XXXX)\s*[:.\-]?\s*\d+/gi, '[ACCOUNT_REMOVED]');

//   // D. Remove Timestamps
//   const timestampRegex = /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^]*?\d{1,2}[:.]\d{2}\s*(?:AM|PM)?/gi;
//   cleanText = cleanText.replace(timestampRegex, '[TIME_REMOVED]');
//   cleanText = cleanText.replace(/\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)/gi, '[TIME_REMOVED]');

//   // E. Remove Marketing & Cashback lines
//   cleanText = cleanText.replace(/(Win|Get|Save|Earn|Upto)\s+(up\s+to\s+)?[\d,.]+/gi, '[PROMO_REMOVED]');
//   cleanText = cleanText.replace(/(earned|cashback|reward).*?\d+(\.\d+)?/gi, '[REWARD_REMOVED]');

//   // 2. Standard Sanitization
//   const sanitizedText = cleanText.replace(/\+\d[\d\s]{10,12}/g, ' [PHONE_REMOVED] ');
  
//   // Handle space-agnostic decimals (fixes Navi "300 . 17" issue)
//   const sanitized = sanitizedText
//     .replace(/[₹$]/g, '')
//     .replace(/(\d)\s?,\s?(\d)/g, '$1$2') // Fixes "1, 000"
//     .replace(/(\d)\s*\.\s*(\d{2})\b/g, '$1.$2'); // Fixes "300 . 17" -> "300.17"

//   // 3. Extract Numbers
//   const numberRegex = /\b\d+(?:\.\d{1,2})?\b/g;
//   const matches = sanitized.match(numberRegex) || [];

//   // 4. Ranking System
//   const candidates = matches.map(num => {
//     let score = 0;
//     const val = parseFloat(num);
//     const strVal = num.toString();
//     const len = strVal.replace('.', '').length;

//     // RULE 1: Massive boost for decimals (Real amounts)
//     if (strVal.includes('.')) {
//         const decimals = strVal.split('.')[1];
//         score += (decimals.length === 2) ? 50 : 25;
//     }

//     // RULE 2: Reward common transaction ranges
//     if (val >= 1 && val <= 100000) score += 15;
    
//     // RULE 3: Penalize tiny amounts or years
//     if (val < 1) score -= 50;
//     if (val > 2020 && val < 2030) score -= 40; 
//     if (len >= 10) score -= 60; 

//     // RULE 4: Context Check
//     if (/Completed|Success|Paid|Received|Successful/i.test(cleanText)) score += 10;

//     return { value: strVal, score };
//   });

//   const bestAmount = candidates.sort((a, b) => b.score - a.score)[0];
//   const finalAmount = bestAmount && bestAmount.score > 0 ? bestAmount.value : null;

//   // 5. Payee Extraction
//   const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
//   let payee = null;
//   const labels = [/Paid to/i, /To:/i, /Sending to/i, /Transfer to/i, /to /i];
  
//   for (const label of labels) {
//     const idx = lines.findIndex(l => label.test(l));
//     if (idx !== -1) {
//       payee = lines[idx].replace(label, '').trim() || lines[idx + 1];
//       break;
//     }
//   }

//   return { 
//     amount: finalAmount, 
//     payee: payee || lines[0], 
//     sanitizedText: cleanText 
//   };
// };
export type ParsedUPIResult = {
  amount: string | null;
  payee: string | null;
  debug?: {
    lines: string[];
    candidates: any[];
  };
};

export const parseUPIText = (rawText: string): ParsedUPIResult => {
  console.log('🟡 RAW TEXT:\n', rawText);

  /* ----------------------------------------------------
   * 1. PRE-CLEANING (STRUCTURE SAFE)
   * -------------------------------------------------- */

  let cleanText = rawText
    .replace(/\bZ(?=\d)/gi, '')
    .replace(/(^|\s)7(?=\d{2,})/g, '$1');

  // Remove VPAs
  cleanText = cleanText.replace(/\S+@\S+/g, '[VPA_REMOVED]');

  // Remove account/card numbers
  cleanText = cleanText.replace(
    /(?:A\/c|Acc|Account|Card|XX|XXXX)\s*[:.\-]?\s*\d+/gi,
    '[ACCOUNT_REMOVED]'
  );

  // Remove timestamps
  const timestampRegex =
    /\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^]*?\d{1,2}[:.]\d{2}\s*(?:AM|PM)?/gi;
  cleanText = cleanText.replace(timestampRegex, '[TIME_REMOVED]');
  cleanText = cleanText.replace(/\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)/gi, '[TIME_REMOVED]');

  // Remove promos / rewards
  cleanText = cleanText.replace(
    /(Win|Get|Save|Earn|Upto)\s+(up\s+to\s+)?[\d,.]+/gi,
    '[PROMO_REMOVED]'
  );
  cleanText = cleanText.replace(
    /(earned|cashback|reward).*?\d+(\.\d+)?/gi,
    '[REWARD_REMOVED]'
  );

  console.log('🟢 AFTER PRE-CLEAN:\n', cleanText);

  /* ----------------------------------------------------
   * 2. PAYEE EXTRACTION (BEFORE SANITIZATION ✅)
   * -------------------------------------------------- */

  const payeeLines = cleanText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  let payee: string | null = null;
  const payeeLabels = [
    /Paid to/i,
    /To:/i,
    /Sending to/i,
    /Transfer to/i,
    /^to\s/i
  ];

  for (const label of payeeLabels) {
    const idx = payeeLines.findIndex(l => label.test(l));
    if (idx !== -1) {
      payee =
        payeeLines[idx].replace(label, '').trim() ||
        payeeLines[idx + 1]?.trim() ||
        null;
      break;
    }
  }

  /* ----------------------------------------------------
   * 3. SANITIZATION (STRUCTURE-CHANGING)
   * -------------------------------------------------- */

  const sanitized = cleanText
    // 🔥 YOUR FIX — keep it
    .replace(/\+\d{1,3}[^\S\r\n]*(?:\d[^\S\r\n]*){7,14}(?=\n|$)/g,' [PHONE_REMOVED]\n')
    .replace(/[₹$]/g, '')
    .replace(/(\d)\s?,\s?(\d)/g, '$1$2')
    .replace(/(\d)\s*\.\s*(\d{2})\b/g, '$1.$2');

  console.log('🟢 SANITIZED TEXT:\n', sanitized);

  /* ----------------------------------------------------
   * 4. LINE BREAKDOWN
   * -------------------------------------------------- */

  const lines = sanitized
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  console.log('🧾 LINES:', lines);

  /* ----------------------------------------------------
   * 5. NUMBER EXTRACTION WITH CONTEXT
   * -------------------------------------------------- */

  const numberRegex = /\b\d+(?:\.\d{1,2})?\b/g;

  const matchesWithContext = lines.flatMap((line, idx) => {
    const nums = line.match(numberRegex) || [];
    return nums.map(num => ({
      num,
      line,
      idx,
      isStandalone: line === num
    }));
  });

  console.log('🔢 NUMBER CANDIDATES:', matchesWithContext);

  /* ----------------------------------------------------
   * 6. SCORING
   * -------------------------------------------------- */

  const candidates = matchesWithContext.map(({ num, line, isStandalone }) => {
    let score = 0;
    const val = parseFloat(num);
    const len = num.replace('.', '').length;

    // Standalone amount line
    if (isStandalone) score += 40;
    else score -= 40;

    // Decimals
    if (num.includes('.')) {
      const decimals = num.split('.')[1];
      score += decimals.length === 2 ? 50 : 25;
    }

    // Typical transaction range
    if (val >= 1 && val <= 100000) score += 15;

    // Penalize junk
    if (val < 1) score -= 50;
    if (val > 2020 && val < 2030) score -= 40;
    if (len >= 10) score -= 60;

    // Bank/account context
    if (/bank|account|a\/c|card/i.test(line)) score -= 50;

    // Success context
    if (/Completed|Success|Paid|Received|Successful/i.test(cleanText)) {
      score += 10;
    }

    return { value: num, score, line };
  });

  console.log('🏆 SCORED CANDIDATES:', candidates);

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  console.log('✅ BEST AMOUNT PICKED:', best);

  /* ----------------------------------------------------
   * 7. FINAL RESULT
   * -------------------------------------------------- */

  return {
    amount: best && best.score > 0 ? best.value : null,
    payee,
    debug: {
      lines,
      candidates
    }
  };
};
