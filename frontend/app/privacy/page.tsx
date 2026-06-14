export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#030614] text-white p-10 font-sans">
      <div className="max-w-4xl mx-auto py-12">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <div className="space-y-6 text-gray-300">
          <p>
            At inbox, we value your privacy. This Privacy Policy outlines what kinds of information we collect, how it's used and protected, and your rights concerning that data.
          </p>

          <h2 className="text-2xl font-semibold text-white mt-8">1. Information Collection</h2>
          <p>
            We collect information when you register on our site, log into your account, or use our services. The collected information includes your name, email address, phone number, and/or credit card.
          </p>

          <h2 className="text-2xl font-semibold text-white mt-8">2. Information Usage</h2>
          <p>
            Any of the information we collect from you may be used to:
            <ul className="list-disc pl-6 mt-4 space-y-2">
              <li>Personalize your experience</li>
              <li>Improve our website</li>
              <li>Improve customer service</li>
            </ul>
          </p>

          <h2 className="text-2xl font-semibold text-white mt-8">3. Information Protection</h2>
          <p>
            We implement a variety of security measures to maintain the safety of your personal information. Only employees who need to perform a specific job (for example, billing or customer service) are granted access to personally identifiable information.
          </p>

          <div className="mt-12 pt-8 border-t border-white/10">
            <a href="/" className="text-blue-400 hover:text-blue-300 transition-colors">
              &larr; Back to Home
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
