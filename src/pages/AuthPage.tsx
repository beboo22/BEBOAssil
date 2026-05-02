import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Plane, Mail, Lock, User, Eye, EyeOff, Loader2, Globe, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { processReferral } from "@/utils/referralSystem";

const COUNTRIES = [
  "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman",
  "Egypt", "Jordan", "Lebanon", "Iraq", "Morocco", "Tunisia", "Algeria", "Libya",
  "Sudan", "Yemen", "Syria", "Palestine",
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France",
  "Italy", "Spain", "Netherlands", "Belgium", "Switzerland", "Austria", "Sweden",
  "Norway", "Denmark", "Finland", "Ireland", "Portugal", "Greece", "Poland",
  "Turkey", "Russia", "Ukraine", "Czech Republic",
  "Japan", "South Korea", "China", "India", "Pakistan", "Bangladesh", "Indonesia",
  "Malaysia", "Thailand", "Philippines", "Vietnam", "Singapore",
  "Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru",
  "South Africa", "Nigeria", "Kenya", "Ghana", "Tanzania",
  "New Zealand",
];

const AuthPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referralCode = searchParams.get('ref');
  const { user } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [age, setAge] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        if (referralCode && session.user) {
          await processReferral(referralCode, session.user.id);
        }
        navigate("/", { replace: true });
      }
    });

    // Listen for native Google Sign-In from the mobile app
    const handleNativeLogin = async (event: any) => {
      let data = event.data;
      if (typeof data === 'string' && data.includes('nativeGoogleLogin')) {
        try { data = JSON.parse(data); } catch(e) {}
      }

      if (data && data.type === 'nativeGoogleLogin') {
        const { idToken } = data;
        if (idToken) {
          try {
            setLoading(true);
            const safetyTimeout = setTimeout(() => {
              setLoading(prev => {
                if (prev) {
                  return false;
                }
                return prev;
              });
            }, 10000);

            const { error } = await supabase.auth.signInWithIdToken({
              provider: 'google',
              token: idToken,
            });
            
            clearTimeout(safetyTimeout);
            
            if (error) {
              throw error;
            }
          } catch (err: any) {
            console.error("Native login error:", err);
            toast.error(err.message || t("auth.error"));
            setLoading(false);
          }
        }
      }

      if (data && data.type === 'nativeGoogleLoginError') {
        setLoading(false);
      }
    };
    window.addEventListener('message', handleNativeLogin);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('message', handleNativeLogin);
    };
  }, [navigate, referralCode, t]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success(t("auth.loginSuccess"));
        navigate("/");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, username, gender, country, age: age ? parseInt(age) : null, birthdate: birthdate || null } },
        });
        if (error) throw error;

        // Update profile with extra fields
        if (data.user) {
          await supabase.from("profiles").update({
            username: username || null,
            gender: gender || null,
            country: country || null,
            age: age ? parseInt(age) : null,
            birthdate: birthdate || null,
          }).eq("id", data.user.id);

          if (referralCode) {
            await processReferral(referralCode, data.user.id);
          }
        }

        toast.success(t("auth.signupSuccess"));
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message || t("auth.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || t("auth.error"));
      setLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || t("auth.error"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background pt-20 pb-10 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <Plane className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold gradient-text">
            {isLogin ? t("auth.welcomeBack") : t("auth.createAccount")}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isLogin ? t("auth.loginSubtitle") : t("auth.signupSubtitle")}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
          <div className="space-y-2.5">
            <Button variant="outline" className="w-full h-11 gap-2" onClick={handleGoogleLogin} disabled={loading}>
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t("auth.continueGoogle")}
            </Button>
            <Button variant="outline" className="w-full h-11 gap-2" onClick={handleAppleLogin} disabled={loading}>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              {t("auth.continueApple")}
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">{t("auth.or")}</span></div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            {!isLogin && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t("auth.fullName")}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="pl-9" placeholder={t("auth.namePlaceholder")} required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="username">{t("auth.username")}</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <Input id="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} className="pl-9" placeholder={t("auth.usernamePlaceholder")} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("auth.gender")}</Label>
                    <Select value={gender} onValueChange={setGender}>
                      <SelectTrigger><SelectValue placeholder={t("auth.selectGender")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">{t("auth.male")}</SelectItem>
                        <SelectItem value="female">{t("auth.female")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("auth.age")}</Label>
                    <Input type="number" min={10} max={120} value={age} onChange={(e) => setAge(e.target.value)} placeholder={t("auth.agePlaceholder")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {t("auth.birthdate")}
                  </Label>
                    <Input
                      type="date"
                      value={birthdate}
                      onChange={(e) => setBirthdate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className="text-sm"
                      lang="en"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    />
                  <p className="text-[10px] text-muted-foreground">
                    {t("auth.birthdateHint")}
                   </p>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("auth.country")}</Label>
                  <Select value={country} onValueChange={setCountry}>
                    <SelectTrigger><SelectValue placeholder={t("auth.selectCountry")} /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {COUNTRIES.sort().map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder="email@example.com" required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pl-9 pr-9" placeholder="••••••••" required minLength={6} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isLogin ? t("auth.signIn") : t("auth.signUp")}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary font-medium hover:underline">
              {isLogin ? t("auth.signUp") : t("auth.signIn")}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default AuthPage;
