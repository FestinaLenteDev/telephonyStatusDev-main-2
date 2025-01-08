let supabase;
let countdownTimer;
let map;
let allData = [];
let geoJsonLayer;
let mapFilterTimeout; 

// Initialize Supabase
function initializeSupabase() {
    if (!supabase) {
        const SUPABASE_URL = 'https://blofihdgffvtiagexpys.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJsb2ZpaGRnZmZ2dGlhZ2V4cHlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQwMTUyOTcsImV4cCI6MjA0OTU5MTI5N30.vlM4Ye_aEdqbl0k5ZjEnEi1k9GEXl9o1zmKtWw8t8i8'; // Replace with your Public API Key
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
}

// Initialize everything on page load
window.onload = () => {
    try {
        initializeSupabase();
        fetchStatuses();
        resetCountdown();
        applyInitialDarkMode();
        applyInitialDarkMode();
        fetchHistoricStatuses();
        showListView();
        setDefaultHistoricFilter();
    } catch (error) {
        displayErrorBanner("An unexpected error occurred during initialization.");
        console.error("Window Load Error:", error);
    }
};

// Initialize the Map
function initializeMap() {
    map = L.map('map-container').setView([20, 0], 2); // Center globally
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}


// Fetch Main Data
async function fetchStatuses() {
    try {
        if (!supabase) initializeSupabase();

        const { data: fetchedData, error } = await supabase.from('statuses').select('country, region, status, last_updated');
        if (error) throw new Error("Error fetching statuses: " + error.message);

        if (!fetchedData || fetchedData.length === 0) throw new Error("No data found.");

        allData = fetchedData;
        populateTable(allData);
        populateMap(allData);
        updateRedBanner(allData);
        updateLastRefresh();
    } catch (error) {
        displayErrorBanner("Failed to fetch status data.");
        console.error("Fetch Statuses Error:", error);
    }
}
//Fetch historic data
let allHistoricData = []; // Add a global variable to store the historic data

async function fetchHistoricStatuses() {
    if (!supabase) initializeSupabase();

    try {
        const { data: historicData, error } = await supabase
            .from('status_history')
            .select('country, status, status_start, status_end');

        if (error) {
            console.error('Error fetching historic statuses:', error.message);
            displayErrorBanner('Failed to fetch historic status data.');
            return;
        }

        // Filter out 'green' statuses
        allHistoricData = historicData.filter(row => 
            row.status.toLowerCase() === 'yellow' || row.status.toLowerCase() === 'red'
        );

        // Default filter: Last 5 days
        applyHistoricFilters();
    } catch (err) {
        console.error('Unexpected error while fetching historic data:', err);
        displayErrorBanner('An unexpected error occurred while fetching historic data.');
    }
}

// Map country names from database to GeoJSON `ADMIN` property
function getStandardizedCountryName(name) {
    const mapping = {
        'USA': 'United States',
        'UK': 'United Kingdom',
        'South Korea': 'Republic of Korea',
        'Russia': 'Russian Federation',
        // Add more mappings as needed
    };

    return mapping[name] || name; // Default to the original name if no mapping exists
}


// ---------- POPULATE UI ----------

// Fetch GeoJSON and Populate Map
async function populateMap(data) {
    try {
        if (!map) initializeMap();

        if (geoJsonLayer) map.removeLayer(geoJsonLayer);

        const response = await fetch('countries.geo.json');
        if (!response.ok) throw new Error("Failed to load GeoJSON file.");

        const geoJsonData = await response.json();

        geoJsonLayer = L.geoJson(geoJsonData, {
            style: feature => {
                const countryName = feature.properties.ADMIN || '';
                const standardizedCountryName = getStandardizedCountryName(countryName);
                const countryData = data.find(d => d.country.toLowerCase() === standardizedCountryName.toLowerCase());
                const status = countryData ? countryData.status : 'unknown';
                return {
                    color: 'white',
                    weight: 1,
                    fillColor: getStatusColor(status),
                    fillOpacity: 0.7
                };
            },
            onEachFeature: (feature, layer) => {
                const countryName = feature.properties.ADMIN || '';
                const standardizedCountryName = getStandardizedCountryName(countryName);
                const countryData = data.find(d => d.country.toLowerCase() === standardizedCountryName.toLowerCase());
                const status = countryData ? countryData.status : 'unknown';

                layer.bindPopup(
                    `<b>${standardizedCountryName}</b><br>Status: ${
                        status.charAt(0).toUpperCase() + status.slice(1)
                    }`
                );
            }
        }).addTo(map);
    } catch (error) {
        displayErrorBanner("Failed to display map data.");
        console.error("Populate Map Error:", error);
    }
}

// Populate table for list view
function populateTable(data) {
    const tbody = document.querySelector('#status-table tbody');
    tbody.innerHTML = '';

    data.forEach(row => {
        const tr = document.createElement('tr');
        const statusIcon = getStatusIcon(row.status);

        // Ensure date is converted to local timezone
        const lastUpdatedLocal = formatDateToLocal(row.last_updated);
        
        tr.innerHTML = `
            <td>${row.country}</td>
            <td>${row.region}</td>
            <td>${statusIcon}</td>
            <td>${lastUpdatedLocal}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Populate historic view table
function populateHistoricTable(data) {
    const tbody = document.querySelector('#historic-table tbody');
    tbody.innerHTML = ''; // Clear any existing rows

    data.forEach(row => {
        const tr = document.createElement('tr');

        // Format start and end times to local time
        const startTime = formatDateToLocal(row.status_start);
        const endTime = row.status_end ? formatDateToLocal(row.status_end) : 'Ongoing';

        // Get the status icon using the existing function
        const statusIcon = getStatusIcon(row.status);

        // Add row content
        tr.innerHTML = `
            <td>${row.country}</td>
            <td>${statusIcon}</td>
            <td>${startTime}</td>
            <td>${endTime}</td>
        `;

        tbody.appendChild(tr);
    });
}

// ---------- FILTER FUNCTIONS ----------

// Apply default filter for historic view on page load
function setDefaultHistoricFilter() {
    const timeFilter = document.getElementById('historic-time-filter');
    timeFilter.value = '120'; // Default to "Last 5 Days"
    applyHistoricFilters(); // Apply the filters on load
}

// Historic view Filters 
function applyHistoricFilters() {
    const selectedHours = parseInt(document.getElementById('historic-time-filter').value, 10);
    const countryFilterValue = document.getElementById('historic-country-filter').value.toLowerCase();

    const now = new Date();
    const cutoffTime = new Date(now.getTime() - selectedHours * 60 * 60 * 1000);

    const filteredHistoricData = allHistoricData.filter(row => {
        const statusStart = new Date(row.status_start);
        const matchesTime = statusStart >= cutoffTime;
        const matchesCountry = !countryFilterValue || row.country.toLowerCase().includes(countryFilterValue);

        return matchesTime && matchesCountry;
    });

    console.log(`Filtered Historic Data:`, filteredHistoricData);

    populateHistoricTable(filteredHistoricData);
}
// Clear historic view filter
function clearHistoricFilters() {
    document.getElementById('historic-time-filter').value = "120";
    document.getElementById('historic-country-filter').value = '';

    applyHistoricFilters();

    console.log("Historic filters cleared and reset to default.");
}

// Map view filters with auto-zoom and highlight functionality

function filterMapByCountry(event) {
    clearTimeout(mapFilterTimeout); 

    const inputField = document.getElementById('map-country-filter');
    const input = inputField.value.trim().toLowerCase();

    if (event && event.key === 'Enter' && !input) {
        clearMapFilter();
        return;
    }

    mapFilterTimeout = setTimeout(() => {
        if (!geoJsonLayer) return;

        let countryFound = false;

        geoJsonLayer.eachLayer(layer => {
            const countryName = (layer.feature.properties.ADMIN || "").toLowerCase();

            if (input && countryName.includes(input)) {
                const bounds = layer.getBounds();
                map.fitBounds(bounds, { maxZoom: 4 });
                const center = bounds.getCenter();
                map.panTo(center);
                layer.openPopup();
                highlightFeature(layer);
                countryFound = true;
            } else {
                resetHighlight(layer);
            }
        });
        if (!countryFound && event && event.key === 'Enter') {
            clearMapFilter();
        }
    }, 300);
}


document.getElementById('map-country-filter').addEventListener('keydown', (event) => filterMapByCountry(event));

function highlightFeature(layer) {
    layer.setStyle({
        weight: 3,
        color: '#FFD700',
        fillOpacity: 0.9
    });
}

function resetHighlight(layer) {
    geoJsonLayer.resetStyle(layer);
}

// Clear map view filter and auto zoom out

function clearMapFilter() {
    const filterInput = document.getElementById('map-country-filter');
    filterInput.value = ''; 

    if (map) {
        map.closePopup();
        map.setView([20, 0], 2);

        
        if (geoJsonLayer) {
            geoJsonLayer.resetStyle();
        }
    }
}

// List view filter

function applyFilters() {
    const countryFilterValue = document.getElementById('country-filter').value.toLowerCase();
    const regionFilterValue = document.getElementById('region-filter').value;
    const statusFilterValue = document.getElementById('status-filter').value;

    const filteredData = allData.filter(row => {
        const matchesCountry = !countryFilterValue || row.country.toLowerCase().includes(countryFilterValue);
        const matchesRegion = !regionFilterValue || row.region === regionFilterValue;
        const matchesStatus = !statusFilterValue || row.status === statusFilterValue;
        return matchesCountry && matchesRegion && matchesStatus;
    });
    populateTable(filteredData);
}

// clear list filter
function clearFilters() {
    document.getElementById('country-filter').value = '';
    document.getElementById('region-filter').value = '';
    document.getElementById('status-filter').value = '';

    populateTable(allData);
}
let sortDirection = { country: 1, region: 1, status: 1 };

// ---------- UTILITIES ----------


// Status Icon - Color
function getStatusIcon(status) {
    if (status === 'green') {
        return `<div style="width: 20px; height: 20px; background-color: #28a745; border-radius: 50%; display: flex; justify-content: center; align-items: center;">
                    <span style="color: white; font-size: 14px; font-weight: bold;">✔</span>
                </div>`;
    } else if (status === 'yellow') {
        return `<div style="width: 20px; height: 20px; background-color: #ffc107; border-radius: 50%; display: flex; justify-content: center; align-items: center;">
                    <span style="color: white; font-size: 14px; font-weight: bold;">!</span>
                </div>`;
    } else if (status === 'red') {
        return `<div style="width: 20px; height: 20px; background-color: #dc3545; border-radius: 50%; display: flex; justify-content: center; align-items: center;">
                    <span style="color: white; font-size: 14px; font-weight: bold;">✘</span>
                </div>`;
    } else if (status === 'not covered by IWG Direct') {
        return `<div style="width: 20px; height: 20px; background-color: #ADD8E6; border-radius: 50%; display: flex; justify-content: center; align-items: center;">
                    <span style="color: white; font-size: 12px; font-weight: bold;">NC</span>
                </div>`;
    } else if (status === 'answered locally') {
        return `<div style="width: 20px; height: 20px; background-color: #FFFFFF; border: 1px solid #000; border-radius: 50%; display: flex; justify-content: center; align-items: center;">
                    <span style="color: black; font-size: 12px; font-weight: bold;">AL</span>
                </div>`;
    }
    return `<div>Unknown</div>`;
}

function getStatusColor(status) {
    if (status === 'green') return '#28a745';
    if (status === 'yellow') return '#ffc107';
    if (status === 'red') return '#dc3545';
    if (status === 'not covered by IWG Direct') return '#ADD8E6'; 
    if (status === 'answered locally') return '#FFFFFF'; 
    return '#cccccc'; 
}

// Display date/time in user local time
function formatDateToLocal(rawDateString) {
    if (!rawDateString) return 'N/A'; 

    let date;

    try {
        if (rawDateString.includes('/')) {
            const [day, month, year, time] = rawDateString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}:\d{2}:\d{2})/).slice(1);
            const isoString = `${year}-${month}-${day}T${time}Z`; 
            date = new Date(isoString);
        } else {
            
            date = new Date(rawDateString);
        }
    } catch (e) {
        console.error("Error parsing date:", rawDateString, e);
        return 'Invalid Date';
    }

    if (isNaN(date)) return 'Invalid Date'; 

    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

// Red alert banner

function updateRedBanner(data) {
    const redCountries = data
        .filter(row => row.status.toLowerCase() === 'red')
        .map(row => row.country);

    const banner = document.getElementById('red-banner');
    const bannerText = document.getElementById('red-countries-text');

    if (redCountries.length > 0) {
        bannerText.textContent = `Attention: Issues detected in the following countries: ${redCountries.join(', ')}`;
        banner.classList.remove('hidden');
    } else {
        banner.classList.add('hidden');
    }
}

// Error Banner
function displayErrorBanner(message) {
    const banner = document.getElementById('error-banner');
    if (banner) {
        banner.textContent = message;
        banner.style.display = 'block';

        // Automatically hide banner after 10 seconds
        setTimeout(() => {
            banner.style.display = 'none';
        }, 10000);
    }
}

//Dark Mode
function applyInitialDarkMode() {
    const userPreference = localStorage.getItem('dark-mode');
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    if (userPreference === 'enabled' || (!userPreference && systemPrefersDark)) {
        enableDarkMode();
    }
}

function enableDarkMode() {
    document.body.classList.add('dark-mode');
    document.getElementById('map-container').classList.add('dark-mode');
    document.getElementById('legend-container')?.classList.add('dark-mode');

    document.querySelectorAll('table, th, td, button, h1').forEach(el => {
        el.classList.add('dark-mode');
    });

    localStorage.setItem('dark-mode', 'enabled');
    document.getElementById('toggle-dark-mode').innerHTML = '<i class="fas fa-sun"></i> Light Mode';
}

function disableDarkMode() {
    document.body.classList.remove('dark-mode');
    document.getElementById('map-container').classList.remove('dark-mode');
    document.getElementById('legend-container')?.classList.remove('dark-mode');

    document.querySelectorAll('table, th, td, button, h1').forEach(el => {
        el.classList.remove('dark-mode');
    });

    localStorage.setItem('dark-mode', 'disabled');
    document.getElementById('toggle-dark-mode').innerHTML = '<i class="fas fa-moon"></i> Dark Mode';
}



function toggleDarkMode() {
    if (document.body.classList.contains('dark-mode')) {
        disableDarkMode();
    } else {
        enableDarkMode();
    }
}

//Views

// Show list view 1
function showListView() {
    // Show List View
    document.getElementById('status-table').style.display = 'table';
    document.querySelector('.filters-container').style.display = 'flex';

    // Hide Map View and Historic View
    document.getElementById('map-container').style.display = 'none';
    document.getElementById('historic-container').style.display = 'none';

    // Hide Historic and Map Filters
    document.getElementById('historic-filters-container').style.display = 'none';
    document.getElementById('map-filters').style.display = 'none';

    console.log("Switched to List View.");
}
// show map view 
function showMapView() {
    document.getElementById('map-container').style.display = 'block';
    document.getElementById('map-filters').style.display = 'block';
    document.getElementById('status-table').style.display = 'none';
    document.getElementById('historic-container').style.display = 'none';

    document.querySelector('.filters-container').style.display = 'none';
    document.getElementById('historic-filters-container').style.display = 'none';
    if (map) {
        setTimeout(() => {
            map.invalidateSize(); 
        }, 100); 
    } else {
        initializeMap(); // Initialize if map is not already set
    }
    console.log("Switched to Map View.");
}

// show historic view 
function showHistoricView() {
    // Hide List View and Map View
    document.getElementById('status-table').style.display = 'none';
    document.getElementById('map-container').style.display = 'none';

    // Show Historic View
    document.getElementById('historic-container').style.display = 'block';
    document.getElementById('historic-filters-container').style.display = 'flex';

    // Hide other filters
    document.querySelector('.filters-container').style.display = 'none';
    document.getElementById('map-filters').style.display = 'none';

    console.log("Switched to Historic View.");
}

// Legend view
function toggleLegend() {
    const legendContainer = document.getElementById('legend-container');
    const toggleButton = document.getElementById('toggle-legend-btn');

    if (legendContainer.style.display === 'none' || legendContainer.style.display === '') {
        legendContainer.style.display = 'block';
        toggleButton.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Legend';
    } else {
        legendContainer.style.display = 'none';
        toggleButton.innerHTML = '<i class="fas fa-info-circle"></i> Show Legend';
    }
}

// Sort function
function sortTable(column) {
    // Initialize the sortDirection object for columns if it doesn't exist
    if (!sortDirection[column]) sortDirection[column] = 1;

    // Toggle sorting direction: 1 for ascending, -1 for descending
    sortDirection[column] *= -1;

    // Sort the global allData array
    allData.sort((a, b) => {
        let valueA = a[column];
        let valueB = b[column];

        // Special handling for the 'last_updated' column
        if (column === 'last_updated') {
            valueA = valueA ? new Date(valueA) : new Date(0); // Use Epoch time if null
            valueB = valueB ? new Date(valueB) : new Date(0);
        } else {
            valueA = valueA?.toString().toLowerCase() || '';
            valueB = valueB?.toString().toLowerCase() || '';
        }

        if (valueA < valueB) return -1 * sortDirection[column];
        if (valueA > valueB) return 1 * sortDirection[column];
        return 0;
    });

    // Re-populate the table with sorted data
    populateTable(allData);

    // Update header arrows dynamically
    updateHeaderArrows(column);
}


function updateHeaderArrows(sortedColumn) {
    const headers = document.querySelectorAll('#status-table th');
    headers.forEach(header => {
        const column = header.getAttribute('onclick')?.match(/'(\w+)'/)[1];
        if (column) {
            header.innerHTML = column.charAt(0).toUpperCase() + column.slice(1) +
                (column === sortedColumn
                    ? (sortDirection[column] === 1 ? ' &#x25B2;' : ' &#x25BC;')
                    : ' &#x25B2;');
        }
    });
}

//last refresh and refresh timer

function updateLastRefresh() {
    const now = new Date();
    const formattedTime = now.toLocaleString('en-GB', { hour12: false });
    document.getElementById('last-refresh').innerText = formattedTime;
}

function resetCountdown() {
    clearCountdown();
    let secondsLeft = 300;

    countdownTimer = setInterval(() => {
        secondsLeft--;

        const minutes = Math.floor(secondsLeft / 60);
        const seconds = secondsLeft % 60;
        document.getElementById('next-refresh').innerText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        if (secondsLeft <= 0) {
            clearCountdown();
            refreshStatuses();
        }
    }, 1000);
}

// Clear Countdown Timer
function clearCountdown() {
    if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
    }
}


// Refresh Data Manually
async function refreshStatuses() {
    try {
        console.log("Manual refresh triggered...");
        clearCountdown();
        await fetchStatuses(); // Refresh main data
        await fetchHistoricStatuses(); // Refresh historic data
        resetCountdown();
    } catch (error) {
        displayErrorBanner("Failed to refresh data.");
        console.error("Refresh Statuses Error:", error);
    }
}

