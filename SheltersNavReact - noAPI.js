import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Button, Alert, Text, Linking } from 'react-native';
import MapView, { Marker, Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import axios from 'axios'; // Import the axios library to make HTTP requests, this will be used to navigate to the closest shelter using the Google Maps API Distance Matrix service
import { PROVIDER_GOOGLE } from 'react-native-maps'; // Import the Google Maps provider for the MapView component

function SheltersNavReact() {
  const mapRef = useRef(null);
  const [userLocation, setUserLocation] = useState(null);
  const [shelters, setShelters] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const defaultLocation = { latitude: 32.0868, longitude: 34.7897 }; // Kikar HaMedina, Tel Aviv
  const [markers, setMarkers] = useState([]);
  const [route, setRoute] = useState([]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }

      let location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
  
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        });
      }

    })();
  }, []);

  const [hasInitMap, setHasInitMap] = useState(false);
  useEffect(() => {
  // This code will run whenever userLocation changes
  console.log('User location updated:', userLocation);
  if (userLocation && !hasInitMap) {
    console.log("Map initializing at location:", userLocation.coords.latitude, userLocation.coords.longitude)
      // Call initMap after getting the user's location
      initMap();
      setHasInitMap(true);
  }
}, [userLocation]); // Pass userLocation as a dependency to useEffect

  // Initialize the map and search for shelters
  const initMap = async () => {
    console.log('Map initialized');
    addCustomControls(); // Add custom controls
    centerMapOnUserLocation(); // Get user's location and center the map

    // search for shelters and navigate to closest shelter
    let appxRadius = 0.05; 
    /* approximate radius in degrees to search around the user's location, every 0.1 degree is about 11km; use a value large enough to ensure that normally more than one shelter is found, to allow user choice between them */
    let sheltersList = [];
    while (sheltersList.length === 0 && appxRadius < 0.5) {
      sheltersList = await nearbySearch(userLocation, appxRadius);
      if (sheltersList.length === 0) {
        console.log(`No shelters found within ${appxRadius} of user's location, expanding search radius`);
        appxRadius += 0.005;
      }
    }//end while loop

    if (sheltersList.length > 0) {
      console.log('Shelters found, navigating to closest shelter');
      NavigateToShelter(sheltersList);
      
      // add markers for each shelter and draw a circle around it, with a click listener to open an info window
      sheltersList.forEach((shelter, shindex) => {
        // Add marker for each shelter
        const marker = {
          coordinate: {
            latitude: shelter.latitude,
            longitude: shelter.longitude,
          },
          key: `shelterMarker_${shindex}`,
          title: shelter.name,
          description: shelter.address,
        };//end marker object
  
        setMarkers((currentMarkers) => [...currentMarkers, marker]);
  
        // Add a circle around the marker
        const circle = {
          coordinate: {
            latitude: shelter.latitude,
            longitude: shelter.longitude,
          },
          key: `shelterCircle_${shindex}`,
          radius: radiusFormula(mapRef.current.getZoom()),
          fillColor: "rgba(0, 0, 255, 0.2)",
          strokeColor: "rgba(0, 0, 0, 0)",
        };//end circle object
  
        setMarkers((currentMarkers) => [...currentMarkers, circle]);
  
        // Update circle radius when map zoom changes
        const updateCircleRadius = () => {
          const updatedMarkers = markers.map(m => {
            if (m.key === `shelterCircle_${shindex}`) {
              return {
                ...m,
                radius: radiusFormula(mapRef.current.getZoom()),
              };
            }
            return m;
          });
          setMarkers(updatedMarkers);
        };//end updateCircleRadius function
  
        mapRef.current.addListener('zoom_changed', updateCircleRadius);
  
        // Handle marker click to show info window (using React Native modal or custom view)
        const openInfoWindow = () => {
          console.log("Clicked on shelter index", shindex, "at", shelter);
          // parse opening hours
          const openingTimesString = shelter.openingHours.Gg.join('<br />');
  
          // Display info window (example using alert)
          Alert.alert(
            shelter.name,
            `Address: ${shelter.address}\n\nBusiness Status: ${shelter.businessStatus}\n\nOpening Hours: ${openingTimesString}`,
            [
              {
                text: "Navigate Here",
                onPress: () => getDirectionsToLocation(shelter.latitude, shelter.longitude),
              },
              {
                text: "Open Street View",
                onPress: () => openStreetViewCustom(shelter.latitude, shelter.longitude),
              },
              { text: "OK" },
            ]
          );
        };//end openInfoWindow function
  
        // Add click listeners to markers and circles
        marker.addListener('press', openInfoWindow);
        circle.addListener('press', openInfoWindow);
      });//end forEach loop
    } else {
      console.log("No shelters found within 5km of user's location");
    }
  };//end initMap function

  // Dummy function to test shelter objects
  const dummyFunction = (latitude, longitude) => {
    console.log("object passed:", latitude, longitude);
  
    // Convert lat and lng to a LatLng-like object
    const latlng = { latitude, longitude };
    console.log("latlng object:", latlng);
  };//end dummyFunction function  

  // calculate the radius of the circle around each shelter marker based on the zoom level (uses exponential decay formula)
  const radiusFormula = (zoomLevel) => {
    let radiusInMeters;
    if (zoomLevel < 5) {
      radiusInMeters = 10;
    } else {
      radiusInMeters = (154143 * Math.exp(-0.41997 * zoomLevel)) / 4;
    }
    return radiusInMeters;
  };//end radiusFormula function  

  // Get directions to the given location
  const getDirectionsToLocation = (lat, lng) => {
    const newDestination = {
      latitude: lat,
      longitude: lng,
    };
    const wrapperArray = [newDestination];
    console.log("Navigating to point:", wrapperArray);
  
    // Clear previous directions if any exist
    setRoute([]);
  
    // Call NavigateToShelter with the new destination as an array
    NavigateToShelter(wrapperArray);
  };//end getDirectionsToLocation function

  // Open Google Street View at the given location
  const openStreetViewCustom = async (lat, lng) => {
    const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    const streetViewRequest = {
      location: `${lat},${lng}`,
      radius: 50, // Set the radius to a small value to check if street view is available nearby
      key: 'MyAPIKey'
    };
  
    try {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/streetview/metadata`,
        { params: streetViewRequest }
      );
  
      if (response.data.status === "OK") {
        // Street view is available
        Linking.openURL(streetViewUrl);
        console.log("Opening street view at", lat, lng);
      } else {
        // Street view is not available
        console.log("Street view is not available at this location");
        Alert.alert("Street view is not available at this location");
      }
    } catch (error) {
      console.log("Error checking street view availability", error);
      Alert.alert("Error checking street view availability");
    }
  };//end openStreetViewCustom function  

  // Search for "bomb shelter" near user's location
  const nearbySearch = async (location, appxRadius) => {
    /*  
      appxRadius is the approximate radius in degrees to search around the location.
      Each degree is approximately 11km, so 0.1 degree is about 1km, and 0.005 is about 500m  
    */
    console.log(`searching around user's location ${location} within ${appxRadius * 100}km radius`);
    
    if (location) {
      // Define the search request
      const request = {
        query: "bomb shelter",
        location: `${location.latitude},${location.longitude}`,
        radius: appxRadius * 111000, // Convert degrees to meters (approximate)
        key: 'MyAPIKey',
        opennow: true,
        language: 'iw',
      };
      console.log("request:", request);
    } else {
      console.log("Location is null");
    }
    
    const response = await axios.get(
      `https://maps.googleapis.com/maps/api/place/textsearch/json`,
      { params: request }
    );
    console.log("response:", response.data);
  
    if (response.data.results.length) {
      console.log("results found:", response.data.results);
  
      const placesAsArray = response.data.results.map((place) => ({
        latitude: place.geometry.location.lat,
        longitude: place.geometry.location.lng,
        name: place.name,
        businessStatus: place.business_status,
        address: place.formatted_address,
        openingHours: place.opening_hours,
      }));
  
      console.log("places as array:", placesAsArray);
      
      // Fit the map to the search results bounds
      if (mapRef.current) {
        mapRef.current.fitToCoordinates(placesAsArray, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }
  
      return placesAsArray;
    } else {
      console.log(`No shelters found within ${appxRadius * 100}km radius`);
      return null;
    }
  };//end nearbySearch function

  // Load shelters and calculate distance to each shelter, then draw path to closest shelter
  const NavigateToShelter = async (sheltersArray) => {
    console.log("distance matrix using shelters array:", sheltersArray);

    // Get user's location
    const userLocation = await Location.getCurrentPositionAsync({});
    const googleLocation = `${userLocation.coords.latitude},${userLocation.coords.longitude}`;
    console.log("calculating distance matrix at location:", userLocation);

    // Prepare destinations for the Distance Matrix API request
    const destinations = sheltersArray.map(
      (shelter) => `${shelter.latitude},${shelter.longitude}`
    ).join('|');

    // Distance Matrix API request
    const distanceMatrixResponse = await axios.get(
      `https://maps.googleapis.com/maps/api/distancematrix/json?units=metric&origins=${googleLocation}&destinations=${destinations}&mode=walking&avoid=highways&key=MyAPIKey`
    );
    console.log('Distance Matrix API response:', distanceMatrixResponse.data);

    // Set variables for closest shelter calculation
    const results = distanceMatrixResponse.data.rows[0].elements; // array of distances to each shelter
    let minDistance = 1000000; // smallest distance to shelter, initialize to large number to ensure first distance is smaller
    let minIndex = 0; // index of closest shelter

    // Loop through the results to find the closest shelter
    for (let j = 0; j < results.length; j++) {
      const element = results[j];
      const distanceAsText = element.distance.text;
      const distanceAsValue = element.distance.value;
      if (distanceAsValue < minDistance) {
        minDistance = distanceAsValue;
        minIndex = j;
      }
      const duration = element.duration.text;
      const from = distanceMatrixResponse.data.origin_addresses[0];
      const to = distanceMatrixResponse.data.destination_addresses[j];
      console.log(`Distance from ${from} to ${to} is ${distanceAsText} and takes ${duration}`);

      // Add marker at shelter location
      setMarkers((currentMarkers) => [
        ...currentMarkers,
        {
          coordinate: sheltersArray[j],
          key: `shelterMarker_${j}`,
        },
      ]);
    };

    console.log(`Closest shelter is ${results[minIndex].distance.text} away`);

    // Directions API request
    const directionsResponse = await axios.get(
      `https://maps.googleapis.com/maps/api/directions/json?origin=${googleLocation}&destination=${destinations[minIndex]}&mode=walking&key=MyAPIKey`
    );
    
    // Decode the polyline and set the route
    const points = Polyline.decode(directionsResponse.data.routes[0].overview_polyline.points);
    const routeCoordinates = points.map(point => {
      return {
        latitude: point[0],
        longitude: point[1],
      };
    });
    setRoute(routeCoordinates);
  };//end NavigateToShelter function

  // Center the map on the user's location
  const centerMapOnUserLocation = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      handleLocationError(false, defaultLocation);
      return;
    }
  
    let location = await Location.getCurrentPositionAsync({});
    const userLocation = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        ...userLocation,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
    } else {
      handleLocationError(true, defaultLocation);
    }
    
    // Add marker at user's location
    setMarkers((currentMarkers) => [
      ...currentMarkers,
      {
        coordinate: userLocation,
        key: 'userLocationMarker',
      },
    ]);
  };//end centerMapOnUserLocation function
  
  // Add custom controls to the map
  const addCustomControls = () => {
    const panToCurrentLocation = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        handleLocationError(false, defaultLocation);
        return;
      }
  
      let location = await Location.getCurrentPositionAsync({});
      const pos = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
  
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          ...pos,
          latitudeDelta: 0.0015,
          longitudeDelta: 0.0015,
        });
      } else {
        handleLocationError(true, pos);
      }
    };
  
    return (
      <Button
        title="Pan to Current Location"
        onPress={panToCurrentLocation}
        style={styles.customMapControlButton}
      />
    );
  };//end addCustomControls function

  // Handle geolocation errors
  const handleLocationError = (browserHasGeolocation, pos) => {
    Alert.alert(
      'Geolocation Error',
      browserHasGeolocation
        ? 'The Geolocation service failed.'
        : "Your device doesn't support geolocation.",
      [{ text: 'OK' }]
    );
  
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: pos.latitude,
        longitude: pos.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
    }
  };//end handleLocationError function
  
  // Open Google Street View at the given location
  const openStreetView = (lat, lng) => {
    const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    Linking.openURL(streetViewUrl);
  };//end openStreetView function

  return (
    <View style={styles.container}>
      <MapView
        //provider={PROVIDER_GOOGLE} // this doesn't work for some reason
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: defaultLocation.latitude,
          longitude: defaultLocation.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
      >
        {shelters.map((shelter, index) => (
          <Marker key={'shelter_${index}'} coordinate={shelter} title="Shelter Location" />
        ))}
        {userLocation && (
          <Circle
            center={userLocation}
            radius={10}
            strokeColor="rgba(0,0,255,0.5)"
            fillColor="rgba(0,0,255,0.1)"
          />
        )}
        {markers.map((marker) => (
          <Marker key={marker.key} coordinate={marker.coordinate} />
        ))}
        {route.length > 0 && (
          <Polyline
            coordinates={route}
            strokeWidth={4}
            strokeColor="blue"
          />
        )}
      </MapView>
      {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
      {addCustomControls()}
    </View>
  );
}//end SheltersNavTest function

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
    width: '100%',
    justifyContent: 'flex-start', // Change to 'flex-start' to align button at the top
    alignItems: 'center',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  customMapControlButton: {
    backgroundColor: '#f2f2f2',
    borderWidth: 0,
    borderRadius: 2,
    shadowColor: 'rgba(0, 0, 0, 0.3)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 1,
    shadowRadius: 4,
    margin: 10,
    padding: 10,
    height: 40,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    margin: 10,
  },
});

export default SheltersNavReact;
