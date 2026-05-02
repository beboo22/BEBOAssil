import React from "react";
import TravelpayoutsWidget from "./TravelpayoutsWidget";

/**
 * TravelWidgets component
 *
 * Renders a list of Travelpayouts widgets inside isolated iframes. Each widget is
 * configured via a URL constructed from environment variables for the affiliate
 * marker (shmarker) and TRS ID. The list of widgets corresponds to the
 * promotional scripts provided by the user. To adjust which widgets are
 * displayed, modify the `scriptUrls` array below. Each entry will be loaded
 * through the TravelpayoutsWidget component which isolates the script in its
 * own iframe, ensuring React’s lifecycle does not interfere with the widget
 * execution.
 */
const TravelWidgets: React.FC = () => {
  // Access environment variables.  If not set, fall back to empty strings to
  // avoid injecting undefined into the URLs.  These variables must begin
  // with `VITE_` to be exposed in a Vite build.  See .env for defaults.
  const marker = import.meta.env.VITE_TRAVELPAYOUTS_SHMARKER || "";
  const trs = import.meta.env.VITE_TRAVELPAYOUTS_TRS || "";

  // Define an array of widget URLs.  Each URL is constructed using the
  // environment variables above.  The widgets cover a variety of Travelpayouts
  // categories including flights, hotels, cars, and transfers.  Feel free to
  // remove or reorder items in this array depending on which widgets you
  // actually want to display.  Only the base URLs are included here; the
  // TravelpayoutsWidget component will handle creating the iframe and loading
  // the script.
  const scriptUrls: string[] = [
    `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${marker}&locale=en&category=4&amount=3&powered_by=true&campaign_id=137&promo_id=4497`,
    `https://tpscr.com/content?trs=${trs}&shmarker=${marker}&locale=en&country=153&city=68511&powered_by=true&campaign_id=87&promo_id=2466`,
    `https://tpscr.com/content?trs=${trs}&shmarker=${marker}&powered_by=true&country=153&lang=en&width=100&background=light&logo=true&header=true&gearbox=false&cars=false&border=true&footer=true&campaign_id=87&promo_id=4322`,
    `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${marker}&language=en&locale=260932&layout=horizontal&cards=4&powered_by=true&campaign_id=89&promo_id=3947`,
    `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${marker}&product=&language=en&layout=horizontal&powered_by=true&campaign_id=89&promo_id=3948`,
    `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${marker}&product%5B0%5D%5Bkey%5D=&product%5B0%5D%5Bvalue%5D=&language=en&layout=horizontal&orientation=vertical&powered_by=true&campaign_id=89&promo_id=3984`,
    `https://tpscr.com/content?currency=usd&trs=${trs}&shmarker=${marker}&locale=en&powered_by=true&limit=4&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&campaign_id=111&promo_id=3411`,
    `https://tpscr.com/content?currency=usd&trs=${trs}&shmarker=${marker}&locale=en&stops=any&show_hotels=true&powered_by=true&border_radius=0&plain=true&color_button=%2300A991&color_button_text=%23ffffff&promo_id=3414&campaign_id=111`,
    `https://tpscr.com/content?currency=usd&trs=${trs}&shmarker=${marker}&powered_by=true&locale=en&show_header=true&limit=3&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&campaign_id=111&promo_id=4478`,
    `https://tpscr.com/content?currency=usd&trs=${trs}&shmarker=${marker}&powered_by=true&locale=en&campaign_id=111&promo_id=4484`,
    `https://tpscr.com/content?currency=usd&trs=${trs}&shmarker=${marker}&locale=en&powered_by=true&limit=4&primary_color=00AE98&results_background_color=FFFFFF&form_background_color=FFFFFF&promo_id=4563&campaign_id=111`,
    `https://tpscr.com/content?trs=${trs}&powered_by=true&shmarker=${marker}&language=ru&display_currency=RUB&transfer_type=any&hide_form_extras=true&hide_external_links=true&disable_currency_selector=true&campaign_id=1&promo_id=691`,
    `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${marker}&language=en&theme=1&powered_by=true&campaign_id=1&promo_id=1486`,
    `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${marker}&locale=en&powered_by=true&show_logo=true&limit=10&bg_color=%23FFFFFF&font_color=%234a4a4a&stars_color=%23dcdcdc&stars_active_color=%23f8bb15&dots_color=%238c8c8c&loader_color=%23ffb300&arrows_color=%238c8c8c&autoscroll=false&autoscroll_delay=5000&promo_id=2948&campaign_id=1`,
    `https://tpscr.com/content?currency=USD&trs=${trs}&shmarker=${marker}&locale=en&powered_by=true&transfer_options_limit=10&transfer_options=MCR&disable_currency_selector=true&hide_form_extras=true&hide_external_links=true&campaign_id=1&promo_id=3879`,
    `https://tpscr.com/content?trs=${trs}&shmarker=${marker}&locale=en&powered_by=true&color_button=%23f2685f&color_focused=%23f2685f&secondary=%23FFFFFF&dark=%2311100f&light=%23FFFFFF&special=%23C4C4C4&border_radius=5&plain=false&no_labels=true&promo_id=8588&campaign_id=541`,
    `https://tpscr.com/content?trs=${trs}&shmarker=${marker}&lang=en&powered_by=true&campaign_id=120&promo_id=8679`,
    `https://tpscr.com/content?trs=${trs}&shmarker=${marker}&locale=en&width=100&height=100&powered_by=true&campaign_id=10&promo_id=2082`,
    `https://tpscr.com/content?trs=${trs}&shmarker=${marker}&locale=en&powered_by=true&border_radius=5&plain=true&show_logo=true&color_background=%23ffca28&color_button=%2355a539&color_text=%23000000&color_input_text=%23000000&color_button_text=%23ffffff&promo_id=4480&campaign_id=10`,
    `https://tpscr.com/content?currency=usd&trs=${trs}&shmarker=${marker}&show_hotels=true&powered_by=true&locale=en&searchUrl=www.aviasales.com%2Fsearch&primary_override=%2332a8dd&color_button=%2355a539&color_icons=%2332a8dd&dark=%23262626&light=%23FFFFFF&secondary=%23FFFFFF&special=%23C4C4C4&color_focused=%2332a8dd&border_radius=5&plain=false&promo_id=7879&campaign_id=100`,
    `https://tpscr.com/content?currency=usd&trs=${trs}&shmarker=${marker}&color_button=%23FF0000&target_host=www.aviasales.com%2Fsearch&locale=en&powered_by=true&origin=LON&destination=BKK&with_fallback=false&non_direct_flights=true&min_lines=5&border_radius=5&color_background=%23FFFFFF&color_text=%23000000&color_border=%23FFFFFF&promo_id=2811&campaign_id=100`,
    `https://tpscr.com/content?currency=usd&trs=${trs}&shmarker=${marker}&lat=51.51&lng=0.06&powered_by=true&search_host=www.aviasales.com%2Fsearch&locale=en&origin=LON&value_min=0&value_max=1000000&round_trip=true&only_direct=false&radius=1&draggable=true&disable_zoom=false&show_logo=false&scrollwheel=false&primary=%233FABDB&secondary=%233FABDB&light=%23ffffff&width=1500&height=500&zoom=2&promo_id=4054&campaign_id=100`,
  ];

  return (
    <div className="space-y-8">
      {scriptUrls.map((url, index) => (
        <TravelpayoutsWidget
          key={index}
          scriptUrl={url}
          containerId={`tp-widget-${index}`}
          // Provide a reasonable minimum height; widgets vary in height but 300px works for most.
          minHeight={350}
        />
      ))}
    </div>
  );
};

export default TravelWidgets;