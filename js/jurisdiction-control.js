/**
 * Jurisdiction Control Script
 * Detects visitor location and enforces jurisdiction restrictions
 * Allowed jurisdictions: Europe, Great Britain, Nigeria
 * Excluded: United States
 */

// Allowed jurisdictions (ISO country codes)
const ALLOWED_COUNTRIES = [
  // Europe
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 
  'SE', 'CH', 'NO', 'IS', 'AL', 'BA', 'ME', 'MK', 'RS', 'UA', 'BY', 'RU',
  // Great Britain
  'GB', 'UK',
  // Nigeria
  'NG'
];

const EXCLUDED_COUNTRIES = ['US', 'USA'];

class JurisdictionControl {
  constructor() {
    this.storageKey = 'jurisdiction_acceptance';
    this.locationStorageKey = 'visitor_country';
    this.init();
  }

  async init() {
    // Check if user has already accepted
    if (this.hasAccepted()) {
      console.log('User has already accepted jurisdiction terms');
      return;
    }

    // Get visitor's country
    const country = await this.getVisitorCountry();
    localStorage.setItem(this.locationStorageKey, country);

    // Check jurisdiction
    if (this.isExcludedJurisdiction(country)) {
      this.showExcludedModal(country);
      return;
    }

    // Show standard acceptance modal
    this.showAcceptanceModal(country);
  }

  /**
   * Get visitor's country using IP geolocation API
   * Uses ip-api.com (free tier, no API key required)
   */
  async getVisitorCountry() {
    try {
      const response = await fetch('https://ip-api.com/json/?fields=countryCode', {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      const data = await response.json();
      console.log('Detected country:', data.countryCode);
      return data.countryCode || 'UNKNOWN';
    } catch (error) {
      console.error('Error detecting location:', error);
      return 'UNKNOWN';
    }
  }

  /**
   * Check if country is in excluded list (US)
   */
  isExcludedJurisdiction(country) {
    return EXCLUDED_COUNTRIES.includes(country);
  }

  /**
   * Check if user has accepted terms
   */
  hasAccepted() {
    return localStorage.getItem(this.storageKey) === 'true';
  }

  /**
   * Mark acceptance
   */
  setAccepted() {
    localStorage.setItem(this.storageKey, 'true');
  }

  /**
   * Show modal for excluded jurisdictions (US)
   */
  showExcludedModal(country) {
    const modal = document.createElement('div');
    modal.id = 'jurisdiction-excluded-modal';
    modal.className = 'jurisdiction-modal excluded';
    modal.innerHTML = `
      <div class="jurisdiction-modal-content">
        <div class="jurisdiction-modal-header">
          <h2>⛔ Access Restricted</h2>
        </div>
        <div class="jurisdiction-modal-body">
          <p><strong>We're sorry, but our services are not available in your jurisdiction.</strong></p>
          <p>Problems with KCH operates under specific legal jurisdictions:</p>
          <ul class="jurisdiction-list">
            <li>🇪🇺 European Union & Europe</li>
            <li>🇬🇧 Great Britain</li>
            <li>🇳🇬 Nigeria</li>
          </ul>
          <p style="color: #d32f2f; font-weight: bold; margin-top: 1rem;">
            ❌ United States (and US territories) are excluded
          </p>
          <p style="font-size: 0.9rem; color: #666; margin-top: 1.5rem;">
            If you believe this is an error or have questions, please contact our support team.
          </p>
        </div>
        <div class="jurisdiction-modal-footer">
          <a href="https://www.google.com" class="jurisdiction-btn primary">Return Home</a>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    this.blockPageContent();
  }

  /**
   * Show acceptance modal for allowed jurisdictions
   */
  showAcceptanceModal(country) {
    const modal = document.createElement('div');
    modal.id = 'jurisdiction-acceptance-modal';
    modal.className = 'jurisdiction-modal';
    modal.innerHTML = `
      <div class="jurisdiction-modal-content">
        <div class="jurisdiction-modal-header">
          <h2>⚖️ Legal Jurisdiction Notice</h2>
        </div>
        <div class="jurisdiction-modal-body">
          <p>Welcome to Problems with KCH!</p>
          <p>Before accessing our site, please confirm that you understand and accept our legal jurisdiction restrictions:</p>
          <div class="jurisdiction-notice">
            <p><strong>✅ Permitted Jurisdictions:</strong></p>
            <ul class="jurisdiction-list">
              <li>🇪🇺 European Union & Europe</li>
              <li>🇬🇧 Great Britain</li>
              <li>🇳🇬 Nigeria</li>
            </ul>
            <p style="margin-top: 1rem;"><strong>❌ Excluded Jurisdictions:</strong></p>
            <p style="color: #d32f2f;">United States of America (including all US territories)</p>
          </div>
          <p style="font-size: 0.9rem; color: #999; margin-top: 1.5rem;">
            Detected location: <strong>${country}</strong>
          </p>
        </div>
        <div class="jurisdiction-modal-footer">
          <button id="jurisdiction-decline" class="jurisdiction-btn secondary">Decline</button>
          <button id="jurisdiction-accept" class="jurisdiction-btn primary">I Accept & Agree</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    this.blockPageContent();

    // Add event listeners
    document.getElementById('jurisdiction-decline').addEventListener('click', () => {
      window.location.href = 'https://www.google.com';
    });

    document.getElementById('jurisdiction-accept').addEventListener('click', () => {
      this.setAccepted();
      this.unblockPageContent();
      modal.remove();
      document.body.style.overflow = 'auto';
    });
  }

  /**
   * Block page content while modal is shown
   */
  blockPageContent() {
    const overlay = document.createElement('div');
    overlay.id = 'jurisdiction-overlay';
    overlay.className = 'jurisdiction-overlay';
    document.body.appendChild(overlay);
  }

  /**
   * Unblock page content
   */
  unblockPageContent() {
    const overlay = document.getElementById('jurisdiction-overlay');
    if (overlay) overlay.remove();
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new JurisdictionControl();
  });
} else {
  new JurisdictionControl();
}
