document.addEventListener('DOMContentLoaded', function() {
 console.log('Document is ready!');
});


/* Slider for services*/
// scripts.js

document.addEventListener('DOMContentLoaded', function () {
 const container = document.querySelector('.scroll-container');
 let isScrolling = false;

 container.addEventListener('wheel', function (e) {
 if (isScrolling) return;

 // Determine scroll direction
 const direction = e.deltaY > 0 ? 1 : -1;
 const sections = document.querySelectorAll('.service-section');
 let currentSectionIndex = [...sections].findIndex(section => section.getBoundingClientRect().top >= 0);
 const nextSectionIndex = currentSectionIndex + direction;

 if (nextSectionIndex >= 0 && nextSectionIndex < sections.length) {
 isScrolling = true;
 container.scrollTo({
 top: sections[nextSectionIndex].offsetTop,
 behavior: 'smooth'
 });

 // Reset scrolling flag after smooth scroll completes
 setTimeout(() => {
 isScrolling = false;
 }, 1800); // Adjust timeout duration based on scroll behavior
 }
 });
});