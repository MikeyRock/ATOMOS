export const environment = {
    production: true,
    // These are only used if runtime-config.js fails to load or set
    // window.__PUBLIC_POOL_CONFIG__ (see docker/entrypoint.sh). Deliberately
    // left empty rather than pointing at any external server - a visible
    // failure (missing connection info) is much safer than silently
    // connecting to someone else's infrastructure.
    API_URL: '',
    STRATUM_URL: '',
    SECURE_STRATUM_URL: '',
    STRATUM_V2_URL: '',
    PPLNS_STRATUM_URL: '',
    PPLNS_SECURE_STRATUM_URL: '',
    PPLNS_STRATUM_V2_URL: '',
    PPLNS_DATUM_URL: '',
};
