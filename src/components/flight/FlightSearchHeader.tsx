
import { motion } from "framer-motion";

const FlightSearchHeader = () => {
  return (
    <div className="bg-gradient-travel text-white py-16">
      <div className="section-container">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Find Your Perfect Flight</h1>
          <p className="text-xl text-white/90 max-w-2xl mx-auto">
            Compare prices and schedules from hundreds of airlines worldwide
          </p>
        </div>
      </div>
    </div>
  );
};

export default FlightSearchHeader;
