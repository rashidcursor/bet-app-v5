/**
 * Utility functions for player name comparison and normalization
 */

/**
 * Normalize player name for comparison - handles accents, special characters, and spacing
 */
function normalizePlayerName(name) {
  if (!name) return '';
  
  // Convert to lowercase and trim
  let normalized = name.trim().toLowerCase();
  
  // Remove accents and special characters
  normalized = normalized
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^\w\s]/g, '') // Remove special characters except letters, numbers, spaces
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
  
  return normalized;
}

/**
 * Check if two player names match with fuzzy comparison
 */
function playerNamesMatch(name1, name2) {
  const normalized1 = normalizePlayerName(name1);
  const normalized2 = normalizePlayerName(name2);
  
  // Direct match
  if (normalized1 === normalized2) {
    return true;
  }
  
  // Check if one name is contained within the other (for cases like "John Smith" vs "Smith")
  const words1 = normalized1.split(' ').filter(word => word.length > 1);
  const words2 = normalized2.split(' ').filter(word => word.length > 1);
  
  // If at least 2 words match, consider it a match
  const matchingWords = words1.filter(word => words2.includes(word));
  if (matchingWords.length >= Math.min(2, Math.min(words1.length, words2.length))) {
    return true;
  }
  
  return false;
}

export { normalizePlayerName, playerNamesMatch };
