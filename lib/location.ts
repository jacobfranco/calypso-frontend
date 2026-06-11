import { Platform } from 'react-native';
import * as Location from 'expo-location';

export type AppLocationPermission = Location.PermissionStatus | 'unknown';

export type CurrentLocationSnapshot = {
  latitude: number;
  longitude: number;
  locationName: string;
  countryCode: string;
  countryName: string;
  permissionStatus: AppLocationPermission;
};

class LocationLookupError extends Error {
  permissionStatus: AppLocationPermission;

  constructor(message: string, permissionStatus: AppLocationPermission = 'unknown') {
    super(message);
    this.name = 'LocationLookupError';
    this.permissionStatus = permissionStatus;
  }
}

export async function getCurrentLocationSnapshot(): Promise<CurrentLocationSnapshot> {
  if (Platform.OS === 'web') {
    const coords = await getCurrentBrowserPosition();
    return {
      ...coords,
      locationName: formatCoordinateLabel(coords.latitude, coords.longitude),
      countryCode: '',
      countryName: '',
      permissionStatus: Location.PermissionStatus.GRANTED,
    };
  }

  let { status } = await Location.getForegroundPermissionsAsync();
  if (status !== Location.PermissionStatus.GRANTED) {
    const request = await Location.requestForegroundPermissionsAsync();
    status = request.status;
  }
  if (status !== Location.PermissionStatus.GRANTED) {
    throw new LocationLookupError(
      'Location is required to use the app. Please enable location services.',
      status
    );
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const placemark = await reverseGeocodeSafe(latitude, longitude);
  return {
    latitude,
    longitude,
    locationName: placemark?.locationName ?? formatCoordinateLabel(latitude, longitude),
    countryCode: placemark?.countryCode ?? '',
    countryName: placemark?.countryName ?? '',
    permissionStatus: status,
  };
}

export function getLocationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to get location';
}

export function getLocationPermissionStatus(error: unknown): AppLocationPermission {
  return error instanceof LocationLookupError ? error.permissionStatus : 'unknown';
}

export function formatCoordinateLabel(latitude: number, longitude: number): string {
  return `Lat ${latitude.toFixed(3)} · Lon ${longitude.toFixed(3)}`;
}

export function formatCoordinateInput(value: number | null): string {
  if (value === null) return '';
  return `${Number(value.toFixed(6))}`;
}

export function normalizeCountryCodeInput(value: string): string {
  return value.replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
}

export function parseLatitudeInput(value: string): number | null {
  return parseBoundedCoordinate(value, -90, 90);
}

export function parseLongitudeInput(value: string): number | null {
  return parseBoundedCoordinate(value, -180, 180);
}

async function reverseGeocodeSafe(latitude: number, longitude: number) {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    const top = results[0];
    if (!top) return null;
    return {
      locationName: formatPlacemark(top) || formatCoordinateLabel(latitude, longitude),
      countryCode: top.isoCountryCode ? top.isoCountryCode.toUpperCase() : '',
      countryName: top.country ?? '',
    };
  } catch {
    return null;
  }
}

function parseBoundedCoordinate(value: string, min: number, max: number): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function getCurrentBrowserPosition(): Promise<{ latitude: number; longitude: number }> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    throw new LocationLookupError(
      'Browser location requires HTTPS or localhost. Open the web app on localhost for local testing.',
      'unknown'
    );
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new LocationLookupError('Browser location is not available in this context.');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => reject(toBrowserLocationError(error)),
      {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 15000,
      }
    );
  });
}

function toBrowserLocationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return new LocationLookupError(
      'Location permission was blocked. Check browser site settings and OS location services, then try again.',
      Location.PermissionStatus.DENIED
    );
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return new LocationLookupError(
      'Your browser could not determine a location. Check OS location services, then try again.'
    );
  }
  if (error.code === error.TIMEOUT) {
    return new LocationLookupError('Location lookup timed out. Try again in a moment.');
  }
  return new LocationLookupError(error.message || 'Unable to get location');
}

function formatPlacemark(placemark: Location.LocationGeocodedAddress) {
  const city = placemark.city || placemark.subregion || '';
  const region = placemark.region || '';
  const country = placemark.country || '';
  if (city && region) return `${city}, ${region}`;
  if (city) return city;
  if (region) return region;
  return country;
}
