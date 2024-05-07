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
// Function to submit a link
const submitLink = async (e) => {
    e.preventDefault();
    const link = e.target.parentElement.querySelector('.linkInput').value;
    try {
      const docRef = await addDoc(collection(db, "submittedLinks"), {
        link: link,
        votes: 0,
        timestamp: new Date()
      });
      console.log("Link submitted with ID: ", docRef.id);
      e.target.parentElement.querySelector('.linkInput').value = '';
      // Refresh the displayed links
      displaySubmittedLinks();
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };
  
  // Function to display submitted links
  const displaySubmittedLinks = async () => {
    const submittedLinksDiv = document.getElementById('submittedLinks');
    submittedLinksDiv.innerHTML = ''; // Clear previous content
    const linksSnapshot = await getDocs(collection(db, "submittedLinks"));
    linksSnapshot.forEach((doc) => {
      const data = doc.data();
      submittedLinksDiv.innerHTML += `
        <div>
          <p>${data.link}</p>
          <button onclick="vote('${doc.id}')">Vote</button>
          <span>Votes: ${data.votes}</span>
        </div>
      `;
    });
  };
  
  // Function to vote for a link
  const vote = async (linkId) => {
    const linkRef = doc(db, "submittedLinks", linkId);
    try {
      await updateDoc(linkRef, {
        votes: increment(1)
      });
      console.log("Vote added for link: ", linkId);
      // Refresh the displayed links
      displaySubmittedLinks();
    } catch (error) {
      console.error("Error updating document: ", error);
    }
  };
  
  // Event listener for submitting a link
  document.getElementById('submitLinkForm').addEventListener('submit', submitLink);
  