export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#030614] text-white p-10 font-sans">
      <div className="max-w-4xl mx-auto py-12">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <div className="space-y-6 text-gray-300">
          <p>
            Welcome to inbox. By accessing or using our website and services, you agree to be bound by these Terms of Service.
          </p>
          
          <h2 className="text-2xl font-semibold text-white mt-8">1. Acceptance of Terms</h2>
          <p>
            By accessing and using our platform, you accept and agree to be bound by the terms and provision of this agreement.
          </p>

          <h2 className="text-2xl font-semibold text-white mt-8">2. Provision of Services</h2>
          <p>
            We are constantly innovating in order to provide the best possible experience for our users. You acknowledge and agree that the form and nature of the services which we provide may change from time to time without prior notice to you.
          </p>

          <h2 className="text-2xl font-semibold text-white mt-8">3. Use of Services</h2>
          <p>
            You agree to use the services only for purposes that are permitted by the Terms and any applicable law, regulation or generally accepted practices or guidelines in the relevant jurisdictions.
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
