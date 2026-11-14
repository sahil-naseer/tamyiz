/**
 * TAMYIZ™ Central Studio & Brand Configuration
 * Single source of truth for contact details, social channels, coordinates, and brand metadata.
 */

export const SITE_URL = 'https://tamyiz.pages.dev';
export const SITE_HOST = 'tamyiz.pages.dev';
const WHATSAPP_NUMBER = '919541722379';

/** WhatsApp link with a pre-order message for one product (used while it is "coming soon"). */
export function preorderWhatsAppUrl(productName, variant) {
  const fmt = variant && variant !== 'Standard' ? ` (${variant})` : '';
  const name = String(productName).replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);
  const text = `Hello TAMYIZ, I'd like to pre-order: ${name}${fmt}. Please message me when it's ready.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export const siteConfig = {
  brandName: "TAMYIZ™",
  brandMonogram: "T•",
  brandSubtitle: "Practical e-books by Sahil & Basit",
  location: "Sopore, Kashmir 193201, India",
  coordinates: "34.28° N, 74.46° E",
  founded: "Late 2025",
  
  // Concierge & Support
  email: "tamyiz.co@gmail.com",
  conciergeEmail: "tamyiz.co@gmail.com",
  supportEmail: "tamyiz.co@gmail.com",
  phone: "+91 95417 22379",
  whatsappNumber: "919541722379",
  whatsappUrl: "https://wa.me/919541722379?text=Hello%20TAMYIZ%20Concierge,%20I%20have%20an%20inquiry%20regarding%20your%20digital%20publications.",

  // Co-Founders
  founders: {
    basit: {
      name: "Basit Majeed",
      fullName: "Basit Majeed",
      role: "Co-Founder • Security & Research",
      badge: "Security & Research",
      bio: "Basit is the security and research mind behind TAMYIZ. A student at Prince Sattam bin Abdulaziz University, he is focused on cybersecurity and ethical hacking, studying how systems are attacked so they can be built to withstand it. He backs that technical work with disciplined research, reading, and writing, and he keeps learning as emerging technology changes the field. His principle is simple: knowledge carries responsibility, and he applies his toward building resilient systems.",
      image: "/assets/images/founders/basit.webp",
      quote: "Knowledge carries responsibility, and we apply ours toward building systems that are clear and resilient.",
      socials: {
        instagram: "https://www.instagram.com/abbasitlone?exln=bjNrbjFjeHhvbXVi",
        linkedin: "https://www.linkedin.com/in/basit-najadi-93944a445",
        x: "https://x.com/Najadifbfw"
      },
      email: "Lone24664@gmail.com"
    },
    sahil: {
      name: "Sahil",
      fullName: "Sahil Naseer",
      role: "Co-Founder • AI/ML & Build",
      badge: "AI/ML & Build",
      bio: "Sahil is the engineer behind TAMYIZ. Artificial intelligence and machine learning are his speciality, and they shape how he thinks: every problem is a system, and every system can be made cleaner, faster, and more precise. He leads TAMYIZ’s technical direction with one rule, which is that nothing stays unless it earns its place. Rigorous in method, exacting in detail, and uncompromising on quality. If it can be simplified, he simplifies it.",
      image: "/assets/images/founders/sahil.webp",
      quote: "Every problem is a system, and every system can be made cleaner, faster, and more precise. Nothing stays unless it earns its place.",
      socials: {
        instagram: "https://www.instagram.com/tamyiz.co/",
        linkedin: "https://www.linkedin.com/in/sahil-naseer-03717b350/",
        x: "https://x.com/sahilnaseer0123"
      },
      email: "sahilnaseer0123@gmail.com"
    }
  },

  // Social Links
  socials: {
    instagram: "https://www.instagram.com/tamyiz.co/",
    linkedin: "https://www.linkedin.com/in/sahil-naseer-03717b350/",
    x: "https://x.com/sahilnaseer0123",
    github: "https://github.com/sahil-naseer/tamyiz"
  }
};

export const SITE_CONFIG = siteConfig;
