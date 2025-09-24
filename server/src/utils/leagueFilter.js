import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache for league mapping data
let leagueMappingCache = null;

/**
 * Load and parse the league mapping CSV file
 * @returns {Object} - Object with allowed league names and IDs
 */
export function loadLeagueMapping() {
  if (leagueMappingCache) {
    return leagueMappingCache;
  }

  try {
    // Path to the CSV file - try multiple possible locations
    const possiblePaths = [
      path.join(__dirname, '../unibet-calc/league_mapping_clean.csv'), // From src/utils to src/unibet-calc
      path.join(process.cwd(), 'server/src/unibet-calc/league_mapping_clean.csv'), // Absolute path
      path.join(__dirname, '../../src/unibet-calc/league_mapping_clean.csv') // Alternative relative path
    ];
    
    let csvPath = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        csvPath = testPath;
        break;
      }
    }
    
    if (!csvPath) {
      console.error('❌ League mapping CSV file not found in any of these locations:');
      possiblePaths.forEach((testPath, index) => {
        console.error(`   ${index + 1}. ${testPath}`);
      });
      return { allowedLeagueNames: new Set(), allowedLeagueIds: new Set() };
    }
    
    console.log('✅ Found CSV file at:', csvPath);

    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // Skip header line
    const dataLines = lines.slice(1);
    
    const allowedLeagueNames = new Set();
    const allowedLeagueIds = new Set();
    
    dataLines.forEach(line => {
      if (line.trim()) {
        const [unibetId, unibetName, fotmobId, fotmobName, matchType, country] = line.split(',');
        
        if (unibetName && unibetName.trim()) {
          // Add both exact name and cleaned name variations
          allowedLeagueNames.add(unibetName.trim());
          allowedLeagueNames.add(unibetName.trim().toLowerCase());
          
          // Also add Fotmob name for matching
          if (fotmobName && fotmobName.trim()) {
            allowedLeagueNames.add(fotmobName.trim());
            allowedLeagueNames.add(fotmobName.trim().toLowerCase());
          }
        }
        
        if (unibetId && unibetId.trim()) {
          allowedLeagueIds.add(unibetId.trim());
        }
      }
    });

    leagueMappingCache = {
      allowedLeagueNames,
      allowedLeagueIds,
      totalLeagues: allowedLeagueNames.size
    };

    console.log(`✅ Loaded ${leagueMappingCache.totalLeagues} allowed leagues from CSV`);
    console.log(`📋 Sample leagues:`, Array.from(allowedLeagueNames).slice(0, 10));
    
    return leagueMappingCache;
  } catch (error) {
    console.error('❌ Error loading league mapping CSV:', error.message);
    return { allowedLeagueNames: new Set(), allowedLeagueIds: new Set() };
  }
}

/**
 * Check if a league ID is in the allowed list
 * @param {string|number} leagueId - The Unibet league ID to check
 * @returns {boolean} - Whether the league is allowed
 */
export function isLeagueAllowed(leagueId) {
  if (!leagueId) {
    return false;
  }

  const { allowedLeagueIds } = loadLeagueMapping();
  
  // Convert to string for comparison
  const leagueIdStr = String(leagueId);
  
  // Check exact match
  if (allowedLeagueIds.has(leagueIdStr)) {
    return true;
  }
  
  return false;
}

/**
 * Check if a league name is in the allowed list (legacy function for backward compatibility)
 * @param {string} leagueName - The league name to check
 * @returns {boolean} - Whether the league is allowed
 */
export function isLeagueNameAllowed(leagueName) {
  if (!leagueName || typeof leagueName !== 'string') {
    return false;
  }

  const { allowedLeagueNames } = loadLeagueMapping();
  
  // Check exact match
  if (allowedLeagueNames.has(leagueName)) {
    return true;
  }
  
  // Check case-insensitive match
  if (allowedLeagueNames.has(leagueName.toLowerCase())) {
    return true;
  }
  
  // Check if any allowed league name contains this league name (partial match)
  for (const allowedName of allowedLeagueNames) {
    if (allowedName.toLowerCase().includes(leagueName.toLowerCase()) || 
        leagueName.toLowerCase().includes(allowedName.toLowerCase())) {
      return true;
    }
  }
  
  return false;
}

/**
 * Filter matches to only include those from allowed leagues
 * @param {Array} matches - Array of match objects
 * @returns {Array} - Filtered array of matches
 */
export function filterMatchesByAllowedLeagues(matches) {
  if (!Array.isArray(matches)) {
    return [];
  }

  const { allowedLeagueIds } = loadLeagueMapping();
  
  const filteredMatches = matches.filter(match => {
    // ONLY use groupId field (Unibet league ID) - STRICT METHOD
    if (match.groupId && isLeagueAllowed(match.groupId)) {
      return true;
    }
    
    return false;
  });

  console.log(`🔍 League filtering: ${matches.length} total matches → ${filteredMatches.length} allowed matches`);
  
  return filteredMatches;
}

/**
 * Get statistics about league filtering
 * @returns {Object} - Statistics about the league mapping
 */
export function getLeagueFilterStats() {
  const mapping = loadLeagueMapping();
  return {
    totalAllowedLeagues: mapping.totalLeagues || 0,
    allowedLeagueNames: Array.from(mapping.allowedLeagueNames || []),
    allowedLeagueIds: Array.from(mapping.allowedLeagueIds || [])
  };
}
