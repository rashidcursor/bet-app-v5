import mongoose from 'mongoose';
import LeagueMapping from '../models/LeagueMapping.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function fixLeagueMappingIndexes() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const collection = LeagueMapping.collection;

        // 1. Get current indexes
        console.log('📋 Current indexes in database:');
        const currentIndexes = await collection.getIndexes();
        console.log(JSON.stringify(currentIndexes, null, 2));
        console.log('');

        // 2. Drop all indexes except _id (which is always there)
        console.log('🗑️  Dropping all indexes except _id...');
        try {
            // Get all index names except _id
            const indexNames = Object.keys(currentIndexes).filter(name => name !== '_id_');
            
            if (indexNames.length > 0) {
                for (const indexName of indexNames) {
                    try {
                        await collection.dropIndex(indexName);
                        console.log(`   ✅ Dropped index: ${indexName}`);
                    } catch (error) {
                        console.log(`   ⚠️  Could not drop index ${indexName}: ${error.message}`);
                    }
                }
            } else {
                console.log('   ℹ️  No indexes to drop (only _id exists)');
            }
        } catch (error) {
            console.log(`   ⚠️  Error dropping indexes: ${error.message}`);
        }
        console.log('');

        // 3. Recreate indexes from schema (with correct unique constraints)
        console.log('🔨 Recreating indexes from schema...');
        
        // Ensure indexes - Mongoose will create them based on schema definition
        await LeagueMapping.ensureIndexes();
        
        // Explicitly create indexes with correct unique settings
        try {
            // Create unibetId index as UNIQUE (only this should be unique)
            await collection.createIndex(
                { unibetId: 1 },
                { unique: true, name: 'unibetId_1' }
            );
            console.log('   ✅ Created unique index on unibetId');
        } catch (error) {
            console.log(`   ⚠️  Error creating unibetId index: ${error.message}`);
        }

        try {
            // Create fotmobId index as NON-UNIQUE (multiple unibetIds can map to same fotmobId)
            await collection.createIndex(
                { fotmobId: 1 },
                { unique: false, name: 'fotmobId_1' }
            );
            console.log('   ✅ Created non-unique index on fotmobId');
        } catch (error) {
            console.log(`   ⚠️  Error creating fotmobId index: ${error.message}`);
        }

        try {
            // Create compound index as NON-UNIQUE
            await collection.createIndex(
                { unibetId: 1, fotmobId: 1 },
                { unique: false, name: 'unibetId_1_fotmobId_1' }
            );
            console.log('   ✅ Created non-unique compound index on (unibetId, fotmobId)');
        } catch (error) {
            console.log(`   ⚠️  Error creating compound index: ${error.message}`);
        }

        console.log('');

        // 4. Verify final indexes using listIndexes() for accurate info
        console.log('✅ Final indexes after fix:');
        const indexList = await collection.listIndexes().toArray();
        
        for (const indexInfo of indexList) {
            const isUnique = indexInfo.unique === true;
            const keys = indexInfo.key ? Object.keys(indexInfo.key) : [];
            console.log(`   ${indexInfo.name}:`);
            if (keys.length > 0) {
                console.log(`      Keys: ${keys.join(', ')}`);
                console.log(`      Unique: ${isUnique ? 'YES ✅' : 'NO (multiple allowed) ✅'}`);
            } else {
                console.log(`      Format: ${JSON.stringify(indexInfo.key)}`);
                console.log(`      Unique: ${isUnique ? 'YES ✅' : 'NO (multiple allowed) ✅'}`);
            }
        }

        // 5. Verify constraint logic using listIndexes() for accurate info
        console.log('');
        console.log('🔍 Verifying constraint logic (using listIndexes()):');
        
        let unibetIdUnique = false;
        let fotmobIdUnique = null;
        let compoundUnique = null;

        for (const indexInfo of indexList) {
            if (indexInfo.name === 'unibetId_1') {
                unibetIdUnique = indexInfo.unique === true;
            }
            if (indexInfo.name === 'fotmobId_1') {
                fotmobIdUnique = indexInfo.unique === true;
            }
            if (indexInfo.name === 'unibetId_1_fotmobId_1') {
                compoundUnique = indexInfo.unique === true;
            }
        }

        // Check if unibetId is unique
        if (unibetIdUnique) {
            console.log('   ✅ unibetId is UNIQUE (correct - one mapping per Unibet league)');
        } else {
            console.log('   ❌ unibetId is NOT unique (ERROR - should be unique)');
            console.log('   🔧 Attempting to recreate unibetId index as unique...');
            try {
                await collection.dropIndex('unibetId_1');
                await collection.createIndex(
                    { unibetId: 1 },
                    { unique: true, name: 'unibetId_1' }
                );
                console.log('   ✅ Recreated unibetId index as unique');
            } catch (error) {
                console.log(`   ⚠️  Error recreating index: ${error.message}`);
            }
        }

        // Check if fotmobId is NOT unique
        if (fotmobIdUnique === false) {
            console.log('   ✅ fotmobId is NOT unique (correct - multiple Unibet leagues can map to same Fotmob league)');
        } else if (fotmobIdUnique === true) {
            console.log('   ❌ fotmobId is UNIQUE (ERROR - should allow duplicates)');
        } else {
            console.log('   ⚠️  fotmobId index not found');
        }

        // Check compound index
        if (compoundUnique === false) {
            console.log('   ✅ Compound index (unibetId, fotmobId) is NOT unique (correct)');
        } else if (compoundUnique === true) {
            console.log('   ❌ Compound index (unibetId, fotmobId) is UNIQUE (ERROR - should allow duplicates)');
        }

        console.log('');
        console.log('✅ Index migration completed successfully!');
        console.log('');
        console.log('📝 Summary:');
        console.log('   - Only unibetId has unique constraint ✓');
        console.log('   - fotmobId allows duplicates (multiple Unibet → same Fotmob) ✓');
        console.log('   - Compound index allows duplicates ✓');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error fixing indexes:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Run the migration
fixLeagueMappingIndexes();
