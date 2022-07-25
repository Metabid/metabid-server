const router = require("express").Router();

const {
  signUp,
  login,
  getUser,
  getBids,
  giveBid,
  acceptBid,
  isOwner,
  protect,
  transfer,
} = require("./userController");

router.post("/signup", signUp);

router.post("/login", login);

router.post("/transfer", protect, transfer);
router.post("/get-bids", getBids);

router.post("/give-bid", protect, giveBid);

router.post("/accept-bid", protect, acceptBid);

router.post("/is-owner", protect, isOwner);

router.get("/:id", getUser);

module.exports = router;
