/**
 * Final group-stage points per player (max 60).
 * Computed from POOL_ENTRIES vs FINAL_GROUP_STANDINGS on 29 Jun 2026.
 * Used on the leaderboard so scores do not depend on live API fetch.
 */
export const GROUP_STAGE_SCORES_BY_EMAIL = {
  'abdollah.kashkooli@imw.ca': 36,
  'abner.chinchilla@imw.ca': 48,
  'ahmed.elsaadawy@imw.ca': 37,
  'aileenwei@imw.ca': 45,
  'aljohn.lazarte@imw.ca': 47,
  'ammar.shoaib@imw.ca': 45,
  'andre.dancs@imw.ca': 30,
  'andrew.martens@imw.ca': 40,
  'ariel.liang@imw.ca': 46,
  'brent.behm@imw.ca': 30,
  'colm.murphy@imw.ca': 38,
  'creigh.sullivan@imw.ca': 45,
  'curtis.toop@imw.ca': 45,
  'dboth94@gmail.com': 37,
  'dustin.dirven@imw.ca': 46,
  'edward.guo@imw.ca': 43,
  'garrett.smith@imw.ca': 47,
  'gary.ghag@imw.ca': 39,
  'gary.lau@imw.ca': 37,
  'han.xu@imw.ca': 46,
  'heidi.mclellan@imw.ca': 28,
  'ian.williams@imw.ca': 38,
  'jackson.lau@imw.ca': 44,
  'jay.simpson@imw.ca': 37,
  'jianchao.lai@imw.ca': 46,
  'john.aydin@imw.ca': 42,
  'jordan.parkes@imw.ca': 38,
  'jvonstar@yahoo.ca': 46,
  'kabulimbojordan@yahoo.com': 14,
  'mali.lombard@imw.ca': 44,
  'mark.evans@imw.ca': 38,
  'mark.lavigne@imw.ca': 33,
  'morgan.beauregard@imw.ca': 31,
  'nikki.watson@imw.ca': 34,
  'omid.basti@imw.ca': 46,
  'peyman.kanzehle@imw.ca': 42,
  'quinn.mudge@imw.ca': 41,
  'rahat.williams@imw.ca': 26,
  'rick.temple@imw.ca': 41,
  'rico.rafael@imw.ca': 28,
  'rina.marceles@imw.ca': 39,
  'robasmith79@gmail.com': 45,
  'shariq@live.ca': 17,
  'stephane.chaland@imw.ca': 40,
  'steve.anderson@imw.ca': 41,
  'torrey.froese@imw.ca': 47,
  'yasar.yilmaz@imw.ca': 38,
};

/** Name fallback when email is missing or differs from the Excel row. */
export const GROUP_STAGE_SCORES_BY_NAME = {
  'abdollah kashkooli': 36,
  'abner chinchilla': 48,
  'ahmed elsaadawy': 37,
  'aileen wei': 45,
  'aj martens': 40,
  'aljon lazarte': 47,
  'ammar syed': 45,
  'andre dancs': 30,
  'ariel liang': 46,
  'brent behm': 30,
  'colm murphy': 38,
  'creigh sullivan': 45,
  'curtis toop': 45,
  'dustin dirven': 46,
  'dylan both': 37,
  'edward guo': 43,
  'garrett smith': 47,
  'gary ghag': 39,
  'gary lau': 37,
  'han xu': 46,
  'heidi mclellan': 28,
  'ian williams': 38,
  'jackson lau': 44,
  'jay simpson': 37,
  'jianchao lai': 46,
  'john aydin': 42,
  'john vanderstarren': 46,
  'jordan kabulimbo': 14,
  'jordan parkes': 38,
  'mali lombard': 44,
  'mark evans': 38,
  'mark lavigne': 33,
  'morgan beauregard': 31,
  'nikki watson': 34,
  'omid basti': 46,
  'peyman kanzehle': 42,
  'quinn mudge': 41,
  'rahat williams': 26,
  'rick temple': 41,
  'rico rafael': 28,
  'rina marceles': 39,
  'robert smith': 45,
  'shari quiring': 17,
  'stephane chaland': 40,
  'steve anderson': 41,
  'torrey froese': 47,
  'yasar yilmaz': 38,
};

export function getFinalizedGroupPoints(entry) {
  const email = (entry.email ?? '').trim().toLowerCase();
  if (email && GROUP_STAGE_SCORES_BY_EMAIL[email] != null) {
    return GROUP_STAGE_SCORES_BY_EMAIL[email];
  }
  const name = (entry.name ?? '').trim().toLowerCase();
  if (name && GROUP_STAGE_SCORES_BY_NAME[name] != null) {
    return GROUP_STAGE_SCORES_BY_NAME[name];
  }
  return null;
}
