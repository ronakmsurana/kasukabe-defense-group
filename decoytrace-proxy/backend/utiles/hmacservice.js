import crypto from 'crypto';
import 'dotenv/config'; 

// Load the secret keys from the environment
// These MUST be set in your .env file: HMAC_REAL_KEY and HMAC_DECOY_KEY
const REAL_KEY = process.env.HMAC_REAL_KEY || 'DEFAULT_REAL_SECRET_KEY';
const DECOY_KEY = process.env.HMAC_DECOY_KEY || 'DEFAULT_DECOY_SECRET_KEY';
const ALGORITHM = 'sha256';

/**
 * Core internal function to generate an HMAC hash.
 * This combines the record's ID and its intended status (REAL/DECOY) 
 * with a secret key to produce a unique, tamper-proof signature.
 * * @param {string} id - The record's unique ID (e.g., MongoDB _id or MySQL ID).
 * @param {string} status - The status, 'REAL' or 'DECOY'.
 * @param {string} secret - The secret key to use for hashing.
 * @returns {string} The HMAC hash digest.
 */
function generateHash(id, status, secret) {
    const data = `${id}:${status}`; // The message payload being authenticated
    return crypto
        .createHmac(ALGORITHM, secret)
        .update(data)
        .digest('hex');
}

/**
 * Creates the signature for a REAL record. 
 * This is the signature for all legitimate data.
 * @param {string} id 
 * @returns {string} The real record signature.
 */
export function createRealSignature(id) {
    return generateHash(id, 'REAL', REAL_KEY);
}

/**
 * Creates the signature for a DECOY record (the cryptographic tripwire).
 * This signature is the unique identifier for the trap.
 * @param {string} id 
 * @returns {string} The decoy record signature.
 */
export function createDecoySignature(id) {
    return generateHash(id, 'DECOY', DECOY_KEY);
}

/**
 * The verification engine. This is the core logic that the middleware uses.
 * It determines if a record is legitimate, a trap, or tampered with.
 * * @param {string} id - The record's ID.
 * @param {string} storedSignature - The signature stored in the database.
 * @returns {string | null} 'REAL', 'DECOY', or null if the signature is invalid.
 */
export function verifySignature(id, storedSignature) {
    if (!storedSignature || !id) return null;

    // 1. Test against the REAL Key
    if (createRealSignature(id) === storedSignature) {
        return 'REAL';
    }
    
    // 2. Test against the DECOY Key (THE CATCH)
    if (createDecoySignature(id) === storedSignature) {
        return 'DECOY';
    }
    
    // If it matches neither, it was likely manually edited by an attacker or corrupted.
    return null; 
}
