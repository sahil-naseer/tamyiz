/**
 * TAMYIZ™ Legal & Atelier Protocols Page
 * Routes:
 *   /legal
 *   /legal/delivery-protocol
 *   /legal/license
 *   /legal/privacy
 *   /legal/terms
 */

import { siteConfig } from '../../data/site-config.js';

export const legalDocs = {
  'delivery-protocol': {
    slug: 'delivery-protocol',
    code: 'POL-01',
    title: 'Shipping & Delivery Policy',
    subtitle: 'Every TAMYIZ product is a digital download. Nothing is shipped by post.',
    lastUpdated: 'October 2026',
    sections: [
      {
        heading: '01. What You Receive',
        content: `Every TAMYIZ™ product is a digital e-book delivered as a PDF file. Nothing is shipped by post.`
      },
      {
        heading: '02. When You Receive It',
        content: `As soon as your payment is confirmed, your download button appears on screen. Download the PDF straight away and keep the file. We also email a receipt with the same download link to the address you entered at checkout (if you can't find it, check Spam or Promotions). The download link stays valid for one year.`
      },
      {
        heading: '03. If Something Goes Wrong',
        content: `If you paid but don't have your file, or lost it later, message us on WhatsApp (+91 95417 22379) or email tamyiz.co@gmail.com with your payment ID, and we'll send the file to you.`
      },
      {
        heading: '04. Corrections',
        content: `If we fix a mistake in a book after you bought it, message us with your order reference and we'll send you the corrected file at no cost.`
      }
    ]
  },
  'license': {
    slug: 'license',
    code: 'POL-02',
    title: 'Refund, Cancellation & License Policy',
    subtitle: 'Refunds, cancellations and what your purchase lets you do',
    lastUpdated: 'October 2026',
    sections: [
      {
        heading: '01. What Your Purchase Lets You Do',
        content: `Each purchase is a personal licence for one person. You may keep the PDF on all your own devices, read it as often as you like, and print copies for your own use. You may use what you learn from it in your work.
Redistribution, reselling, sub-licensing, torrenting, or public sharing of the PDF files or download links is strictly prohibited under the Copyright Act, 1957.`
      },
      {
        heading: '02. Refund & Cancellation Terms for Digital Assets',
        content: `Because all TAMYIZ™ e-books are delivered instantly as DRM-free PDF files that can't be returned, completed digital sales are final once the download link has been delivered, except in the cases below.`
      },
      {
        heading: '03. When You Get a Refund (within 7 days)',
        content: `Tell us within 7 days of purchase and you get a full refund if:
• You were charged twice for the same order (for example a duplicate UPI debit after a network timeout).
• You paid but did not get your download link, and we could not deliver it within 24 hours of you telling us.
• The file is damaged or will not open, and we could not send you a working copy within 24 hours of you telling us.
To ask for a refund, WhatsApp +91 95417 22379 or email tamyiz.co@gmail.com with your payment ID.`
      },
      {
        heading: '04. Settlement & Refund Processing Timeline',
        content: `Approved refunds are initiated through our payment gateway within 48 hours of verification and credited back to the original source account (UPI, Credit/Debit Card, or NetBanking) within 5–7 business days in accordance with Indian banking clearing standards.`
      }
    ]
  },
  'privacy': {
    slug: 'privacy',
    code: 'POL-03',
    title: 'Privacy & Data Security Policy',
    subtitle: 'What we collect, why we collect it, and your rights',
    lastUpdated: 'November 2026',
    sections: [
      {
        heading: '01. What We Collect',
        content: `In line with India's Digital Personal Data Protection (DPDP) Act, 2023, TAMYIZ collects only what it needs:
• When you buy: your email address, mobile number, the e-books you bought and the payment reference from Razorpay. (Your name stays on your own device; it is only printed on your on-screen receipt.)
• When you type your email in the bag or at checkout: your email, mobile number and the e-books in your bag, so we can remind you once if you don't finish the order.
• When you ask for a free sample: your email (and mobile number if you give it).
• When you write a review: your name, email and review. Only your name, rating and review are ever shown on the site; your email is never published.`
      },
      {
        heading: '02. Why We Use It',
        content: `To deliver your e-book and receipt, to send you your download links again if you ask, to help you with an order, to send the free sample email (with one welcome discount code), and to send one reminder about an unfinished bag. We do not send marketing emails beyond these.`
      },
      {
        heading: '03. Who Handles It For Us',
        content: `Payments are handled by Razorpay, a PCI-DSS certified payment gateway. We never see or store your card number, CVV, UPI PIN or bank login.
The website and its data are hosted on Cloudflare. Emails are sent through Brevo. These services handle your details only to provide their service to us.`
      },
      {
        heading: '04. Visitor Statistics and Your Device',
        content: `We use Cloudflare Web Analytics to count visits and see which pages are read, so we can improve the site. It uses no cookies, does not track you across other websites, and does not tell us who you are: we only see totals such as page views, country and device type.
Your bag and the details you type at checkout are saved in your own browser (local storage) so they are still there next time. You can clear them by clearing this site's data in your browser.`
      },
      {
        heading: '05. How Long We Keep It',
        content: `Order details are kept while your download links are valid and for as long as Indian tax and accounting rules require. Sample, review and unfinished-bag details are kept until you ask us to delete them or they are no longer needed.`
      },
      {
        heading: '06. Sharing and Your Rights',
        content: `We never sell or rent your details, and we don't share them with advertisers.
You can ask to see, correct or delete your details, or withdraw your consent, at any time by emailing tamyiz.co@gmail.com. Complaints about how we handle your data go to our Grievance Officer (see Contact Us).`
      }
    ]
  },
  'terms': {
    slug: 'terms',
    code: 'POL-04',
    title: 'Terms of Service & Merchant Notice',
    subtitle: 'Terms & Conditions + Merchant Legal Notice',
    lastUpdated: 'October 2026',
    sections: [
      {
        heading: '01. Who Runs TAMYIZ',
        content: `TAMYIZ™ (tamyiz.pages.dev) is run by its co-founders from Sopore, Jammu & Kashmir 193201, India.
Co-founded by Basit Majeed and Sahil Naseer.`
      },
      {
        heading: '02. Official Merchant Support Channels',
        content: `Official customer support and statutory compliance inquiries:
• Email: tamyiz.co@gmail.com
• WhatsApp or phone: +91 95417 22379 (Available Monday–Saturday, 10:00–19:00 IST)`
      },
      {
        heading: '03. Prices and What You Get',
        content: `All prices are in Indian Rupees (₹). The price shown is the full amount you pay; nothing is added at checkout. Each purchase is a personal licence for one person to that e-book (see the Refund, Cancellation & License Policy). If we correct mistakes in a book later, buyers can ask for the corrected file free of charge.`
      },
      {
        heading: '04. Governing Law & Dispute Resolution',
        content: `These terms and all digital transactions are governed exclusively by the laws of India. Any legal disputes arising in connection with TAMYIZ™ shall be subject to the exclusive jurisdiction of the competent courts in Sopore / Baramulla, Jammu & Kashmir, India.`
      }
    ]
  },
  'contact': {
    slug: 'contact',
    code: 'POL-05',
    title: 'Contact Us',
    subtitle: 'How to reach TAMYIZ about an order, a refund or anything else',
    lastUpdated: 'November 2026',
    sections: [
      {
        heading: '01. Fastest: WhatsApp',
        content: `WhatsApp or call +91 95417 22379 (Monday–Saturday, 10:00–19:00 IST). For an order, include the order reference from your receipt.`
      },
      {
        heading: '02. Email',
        content: `tamyiz.co@gmail.com. We reply within one working day.`
      },
      {
        heading: '03. Business details',
        content: `TAMYIZ™ is run by its co-founders Basit Majeed and Sahil Naseer.
Address: Sopore, Jammu & Kashmir 193201, India.`
      },
      {
        heading: '04. Grievance Officer',
        content: `Under the Consumer Protection (E-Commerce) Rules, 2020 and the DPDP Act, 2023, complaints about an order or about your personal data can be sent to our Grievance Officer:
• Name: Sahil Naseer, Co-founder
• Email: tamyiz.co@gmail.com
• Phone / WhatsApp: +91 95417 22379
We acknowledge every complaint within 48 hours and resolve it within one month of receiving it.`
      }
    ]
  }
};

export function formatLegalContentHtml(content = '') {
  const lines = String(content).split('\n').map((l) => l.trim()).filter(Boolean);
  const blocks = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<ul class="tamyiz-legal-list">${listItems.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    if (line.startsWith('• ')) {
      listItems.push(line.slice(2).trim());
    } else if (line.startsWith('- ')) {
      listItems.push(line.slice(2).trim());
    } else {
      flushList();
      blocks.push(`<p>${line}</p>`);
    }
  }
  flushList();

  return blocks.join('');
}

export function renderLegalPage(activeSlug = 'delivery-protocol', appInstance) {
  const validSlug = legalDocs[activeSlug] ? activeSlug : 'delivery-protocol';
  const doc = legalDocs[validSlug];

  const tabList = [
    { slug: 'delivery-protocol', label: 'Shipping & Delivery', code: '01' },
    { slug: 'license', label: 'Refunds & License', code: '02' },
    { slug: 'privacy', label: 'Privacy & Security', code: '03' },
    { slug: 'terms', label: 'Terms of Service', code: '04' },
    { slug: 'contact', label: 'Contact Us', code: '05' }
  ];

  return `
    <div class="tamyiz-page-legal">
      <!-- HEADER BANNER -->
      <section class="tamyiz-page-header">
        <div class="container">
          <div class="tamyiz-page-header-inner">
            <span class="tmz-label">Policies · ${doc.code}</span>
            <h1 class="tamyiz-page-title">${doc.title}</h1>
            <p class="tamyiz-page-description">${doc.subtitle}</p>
          </div>
        </div>
      </section>

      <!-- NAVIGATION TABS -->
      <nav class="tamyiz-legal-tabs-bar" aria-label="Policy documents">
        <div class="container">
          <div class="tamyiz-legal-tabs-list">
            ${tabList.map(tab => `
              <button
                type="button"
                class="tamyiz-legal-tab-btn ${tab.slug === validSlug ? 'active' : ''}"
                aria-current="${tab.slug === validSlug ? 'page' : 'false'}"
                onclick="window.tamyizApp.navigateTo('/legal/${tab.slug}')"
              >
                <span class="tamyiz-legal-tab-code">${tab.code}</span>
                <span>${tab.label}</span>
              </button>
            `).join('')}
          </div>
        </div>
      </nav>

      <!-- MAIN LEGAL CONTENT -->
      <section class="tamyiz-section tamyiz-legal-page-section">
        <div class="container tamyiz-legal-page-container">
          <article class="tamyiz-legal-doc-card">
            <div class="tamyiz-legal-doc-meta">
              <span>TAMYIZ policy</span>
              <span>Effective: ${doc.lastUpdated}</span>
            </div>

            <div class="tamyiz-legal-sections">
              ${doc.sections.map(sec => `
                <section class="legal-section tamyiz-legal-section-item">
                  <h2 class="tamyiz-legal-page-heading">${sec.heading}</h2>
                  <div class="tamyiz-legal-section-text">${formatLegalContentHtml(sec.content)}</div>
                </section>
              `).join('')}
            </div>

            <!-- BUSINESS CONTACT DETAILS -->
            <div class="tamyiz-legal-contact-footer tamyiz-legal-page-contact">
              <div class="tamyiz-legal-contact-title">Business Contact Details</div>
              <div class="tamyiz-legal-contact-grid">
                <div class="tamyiz-legal-contact-col">
                  <div><strong>Business:</strong> TAMYIZ™, run by Basit Majeed &amp; Sahil Naseer</div>
                  <div><strong>Address:</strong> Sopore, Jammu &amp; Kashmir 193201, India</div>
                </div>
                <div class="tamyiz-legal-contact-col">
                  <div><strong>Email:</strong> <a href="mailto:tamyiz.co@gmail.com" class="tamyiz-legal-link">tamyiz.co@gmail.com</a></div>
                  <div><strong>Phone &amp; WhatsApp:</strong> <a href="tel:+919541722379" class="tamyiz-legal-link tamyiz-nowrap">+91 95417 22379</a> (10:00–19:00 IST)</div>
                  <div><strong>Delivery:</strong> download link on screen right after payment, plus an email receipt</div>
                  <div><strong>Refunds:</strong> within 7 days for a double charge, or a file we could not deliver or fix</div>
                </div>
              </div>
            </div>

            <div class="tamyiz-legal-doc-footer">
              <div class="tamyiz-legal-doc-query">
                Questions about this policy? Email
                <a href="mailto:${siteConfig.conciergeEmail}" class="tamyiz-legal-link">${siteConfig.conciergeEmail}</a>
              </div>
              <button
                type="button"
                class="tamyiz-btn-nav-outline"
                onclick="window.tamyizApp.navigateTo('/editions')"
              >
                <span>See the e-books</span>
                <span>→</span>
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>
  `;
}
