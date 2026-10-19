import en from '../i18n/locales/en.json';
import te from '../i18n/locales/te.json';

describe('Localization Resources', () => {
  it('should have matching keys in English and Telugu resources', () => {
    expect(en.common.appName).toBe('APHC Case Tracker');
    expect(te.common.appName).toBe('APHC కేస్ ట్రాకర్');
    expect(en.dashboard.title).toBeDefined();
    expect(te.dashboard.title).toBeDefined();
  });

  it('should have proper court titles', () => {
    expect(en.common.courtName).toContain('High Court of Andhra Pradesh');
    expect(te.common.courtName).toContain('ఆంధ్రప్రదేశ్ హైకోర్టు');
  });
});
