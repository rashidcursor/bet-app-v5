import express from 'express';
import { loadLeagueMapping } from '../../utils/leagueFilter.js';
import League from '../../models/League.js';
import { downloadLeagueMappingClean } from '../../utils/cloudinaryCsvLoader.js';

const router = express.Router();

/**
 * Parse CSV line properly handling quoted fields with commas
 * @param {string} line - CSV line to parse
 * @returns {string[]} - Array of parsed fields
 */
function parseCsvLine(line) {
  const fields = [];
  let currentField = '';
  let insideQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      fields.push(currentField.trim().replace(/^"|"$/g, ''));
      currentField = '';
    } else {
      currentField += char;
    }
  }
  // Add the last field
  if (currentField.trim() || fields.length > 0) {
    fields.push(currentField.trim().replace(/^"|"$/g, ''));
  }
  
  // Ensure we have at least 6 fields (pad with empty strings if needed)
  while (fields.length < 6) {
    fields.push('');
  }
  
  return fields;
}

// GET /api/admin/leagues - Get all leagues from Cloudinary CSV
router.get('/', async (req, res) => {
  try {
    console.log('📋 Fetching leagues from Cloudinary CSV...');
    
    // Load the CSV data from Cloudinary
    const csvContent = await downloadLeagueMappingClean();
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // Skip header line
    const dataLines = lines.slice(1);
    
    console.log(`📊 Total data lines in CSV: ${dataLines.length}`);
    
    // Get popular leagues from database
    const popularLeaguesInDb = await League.find({}).lean();
    const popularLeaguesMap = new Map(
      popularLeaguesInDb.map((league) => [league.leagueId, league])
    );

    const leagues = [];
    let skippedCount = 0;
    let errorCount = 0;
    
    dataLines.forEach((line, index) => {
      if (!line.trim()) {
        skippedCount++;
        return;
      }
      
      try {
        // ✅ IMPROVED: Better CSV parsing that handles quoted values with commas
        const fields = parseCsvLine(line);
        const [unibetId, unibetName, fotmobId, fotmobName, matchType, country] = fields;
        
        // Skip if essential fields are missing
        if (!unibetId || !unibetName || !fotmobId) {
          console.warn(`⚠️ Line ${index + 2}: Skipping - Missing essential fields (Unibet ID: ${unibetId}, Name: ${unibetName}, Fotmob ID: ${fotmobId})`);
          skippedCount++;
          return;
        }
        
        const leagueId = parseInt(unibetId);
        if (isNaN(leagueId)) {
          console.warn(`⚠️ Line ${index + 2}: Skipping - Invalid Unibet ID: ${unibetId}`);
          skippedCount++;
          return;
        }
        
        // ✅ FIX: Normalize country name - trim and ensure consistent casing
        const normalizedCountry = country?.trim() || 'Other';
        
        // Check if this league is marked as popular in database
        const dbLeague = popularLeaguesMap.get(leagueId);
        
        leagues.push({
          id: leagueId, // Use Unibet ID as the league ID
          unibetId: unibetId.trim(),
          name: unibetName.trim(),
          fotmobId: fotmobId.trim(),
          fotmobName: fotmobName.trim(),
          matchType: matchType?.trim() || '',
          country: {
            name: normalizedCountry,
            official_name: normalizedCountry,
            image: null // No country images in CSV
          },
          image_path: null, // No league images in CSV
          isPopular: dbLeague ? dbLeague.isPopular : false, // Get from database or default to false
          popularOrder: dbLeague?.order || 0, // Get from database or default to 0
          short_code: null // No short codes in CSV
        });
      } catch (error) {
        console.error(`❌ Line ${index + 2}: Error parsing - ${error.message}`);
        console.error(`   Line content: ${line.substring(0, 100)}...`);
        errorCount++;
      }
    });

    console.log(`✅ Loaded ${leagues.length} leagues from CSV`);
    console.log(`⚠️ Skipped ${skippedCount} empty/invalid lines`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Expected: ${dataLines.length}, Got: ${leagues.length}, Skipped: ${skippedCount + errorCount}`);

    res.json({
      success: true,
      data: leagues,
      total: leagues.length,
      skipped: skippedCount,
      errors: errorCount,
      expected: dataLines.length
    });

  } catch (error) {
    console.error('❌ Error fetching leagues from CSV:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leagues from CSV',
      message: error.message
    });
  }
});

// GET /api/admin/leagues/popular - Get popular leagues (placeholder for now)
router.get('/popular', async (req, res) => {
  try {
    console.log('📋 Fetching popular leagues...');
    
    // For now, return empty popular leagues
    // This can be extended later to store popular leagues in database
    res.json({
      success: true,
      data: [],
      total: 0
    });

  } catch (error) {
    console.error('❌ Error fetching popular leagues:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch popular leagues',
      message: error.message
    });
  }
});

// POST /api/admin/leagues/popular - Update popular leagues
router.post('/popular', async (req, res) => {
  try {
    console.log('📋 Updating popular leagues...');
    console.log('📊 Leagues to update:', req.body.leagues);
    
    const { leagues } = req.body;
    
    if (!Array.isArray(leagues)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid leagues data format'
      });
    }
    
    // Clear all existing popular leagues
    await League.deleteMany({});
    
    // Insert new popular leagues
    const leaguesToInsert = leagues.map(league => ({
      leagueId: league.leagueId,
      name: league.name,
      isPopular: league.isPopular,
      order: league.order || 0
    }));
    
    if (leaguesToInsert.length > 0) {
      await League.insertMany(leaguesToInsert);
    }
    
    console.log(`✅ Updated ${leaguesToInsert.length} popular leagues in database`);
    
    res.json({
      success: true,
      message: 'Popular leagues updated successfully',
      data: leaguesToInsert
    });

  } catch (error) {
    console.error('❌ Error updating popular leagues:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update popular leagues',
      message: error.message
    });
  }
});

// GET /api/admin/leagues/mapping - Get league mapping for frontend (Unibet→Fotmob + filtering data)
router.get('/mapping', async (req, res) => {
  try {
    console.log('📋 Fetching league mapping for frontend from Cloudinary...');
    
    // Load the CSV data from Cloudinary
    const csvContent = await downloadLeagueMappingClean();
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    // Skip header line
    const dataLines = lines.slice(1);
    
    console.log(`📊 Total data lines in CSV: ${dataLines.length}`);
    
    // Build mapping objects
    const unibetToFotmobMapping = {};
    const allowedLeagueIds = [];
    const allowedLeagueNames = [];
    let skippedCount = 0;
    let errorCount = 0;
    
    dataLines.forEach((line, index) => {
      if (!line.trim()) {
        skippedCount++;
        return;
      }
      
      try {
        // ✅ IMPROVED: Better CSV parsing that handles quoted values with commas
        const fields = parseCsvLine(line);
        const [unibetId, unibetName, fotmobId, fotmobName, matchType, country] = fields;
        
        // Skip if essential fields are missing
        if (!unibetId || !unibetName || !fotmobId) {
          console.warn(`⚠️ Line ${index + 2}: Skipping - Missing essential fields (Unibet ID: ${unibetId}, Name: ${unibetName}, Fotmob ID: ${fotmobId})`);
          skippedCount++;
          return;
        }
        
        const trimmedUnibetId = unibetId.trim();
        const trimmedUnibetName = unibetName.trim();
        const trimmedFotmobId = fotmobId.trim();
        const trimmedFotmobName = fotmobName?.trim() || '';
        
        // Add to Unibet→Fotmob mapping (for icons)
        if (trimmedUnibetId && trimmedFotmobId) {
          unibetToFotmobMapping[trimmedUnibetId] = trimmedFotmobId;
        }
        
        // Add to allowed league IDs (for filtering)
        if (trimmedUnibetId) {
          allowedLeagueIds.push(trimmedUnibetId);
        }
        
        // Add to allowed league names (for filtering)
        if (trimmedUnibetName) {
          allowedLeagueNames.push(trimmedUnibetName);
          allowedLeagueNames.push(trimmedUnibetName.toLowerCase());
          
          // Also add Fotmob name for matching
          if (trimmedFotmobName) {
            allowedLeagueNames.push(trimmedFotmobName);
            allowedLeagueNames.push(trimmedFotmobName.toLowerCase());
          }
        }
      } catch (error) {
        console.error(`❌ Line ${index + 2}: Error parsing - ${error.message}`);
        console.error(`   Line content: ${line.substring(0, 100)}...`);
        errorCount++;
      }
    });

    console.log(`✅ Built mapping: ${Object.keys(unibetToFotmobMapping).length} leagues`);
    console.log(`✅ Allowed league IDs: ${allowedLeagueIds.length}`);
    console.log(`✅ Allowed league names: ${allowedLeagueNames.length}`);
    console.log(`⚠️ Skipped ${skippedCount} empty/invalid lines`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Expected: ${dataLines.length}, Got: ${allowedLeagueIds.length}, Skipped: ${skippedCount + errorCount}`);

    res.json({
      success: true,
      data: {
        unibetToFotmobMapping,
        allowedLeagueIds,
        allowedLeagueNames,
        totalLeagues: allowedLeagueIds.length
      },
      timestamp: new Date().toISOString(),
      cacheHint: 'Cache this response for 1 hour' // Frontend can cache
    });

  } catch (error) {
    console.error('❌ Error fetching league mapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch league mapping',
      message: error.message
    });
  }
});

export default router;
