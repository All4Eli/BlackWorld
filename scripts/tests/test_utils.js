const jose = require('jose');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'blackworld_super_secret_dev_key_only';
const encodedSecret = new TextEncoder().encode(JWT_SECRET);

async function createSessionToken(userId) {
    const jwt = await new jose.SignJWT({ userId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(encodedSecret);
    return jwt;
}

async function fetchApi(path, options = {}) {
    const url = `${API_URL}${path}`;
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (options.userId) {
        const token = await createSessionToken(options.userId);
        headers['Cookie'] = `__bw_sess=${token}`;
    }
    
    try {
        const response = await fetch(url, { ...options, headers });
        const isJson = response.headers.get('content-type')?.includes('application/json');
        
        let data;
        if (response.status !== 204) {
            const textData = await response.text();
            try {
                data = textData ? JSON.parse(textData) : {};
            } catch {
                data = textData;
            }
        } else {
            data = null;
        }

        return { status: response.status, data, headers: response.headers };
    } catch (error) {
        throw new Error(`API Request failed: ${options.method || 'GET'} ${url} - ${error.message}`);
    }
}

module.exports = {
    API_URL,
    fetchApi,
    createSessionToken
};
