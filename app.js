import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDRDPueFbHs8rrZDuq3kCjSevukjRZztro",
    authDomain: "commonwebsite-5e316.firebaseapp.com",
    projectId: "commonwebsite-5e316",
    storageBucket: "commonwebsite-5e316.appspot.com",
    messagingSenderId: "138538311145",
    appId: "1:138538311145:web:34d891df8ed4ce16dbbf78"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Function to submit a request for a movie magnet
const submitRequest = async (e) => {
  e.preventDefault();
  const movieName = document.getElementById('movieName').value;
  try {
    const docRef = await addDoc(collection(db, "requests"), {
      movieName: movieName,
      timestamp: new Date()
    });
    console.log("Request submitted with ID: ", docRef.id);
    document.getElementById('movieName').value = '';
  } catch (error) {
    console.error("Error adding document: ", error);
  }
};

// Function to fetch and display open requests
const displayOpenRequests = async () => {
  const openRequestsDiv = document.getElementById('openRequests');
  openRequestsDiv.innerHTML = ''; // Clear previous content
  const requestsSnapshot = await getDocs(collection(db, "requests"));
  requestsSnapshot.forEach((doc) => {
    const data = doc.data();
    openRequestsDiv.innerHTML += `<div>${data.movieName}</div>`;
  });
};

// Function to handle submitting links
const submitLink = async (e) => {
  e.preventDefault();
  const link = e.target.parentElement.querySelector('.linkInput').value;
  // Submit the link to Firebase
};

// Function to display submitted links
const displaySubmittedLinks = async () => {
  // Fetch submitted links from Firebase
};

// Event listener for submitting a request
document.getElementById('requestForm').addEventListener('submit', submitRequest);

// Initial setup
displayOpenRequests();
displaySubmittedLinks();
