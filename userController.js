const { promisify } = require("util");
const User = require("./userModel");
const jwt = require("jsonwebtoken");
const TronWeb = require("tronweb");
const sdk = require("api")("@tron/v4.5.1#7p0hyl5luq81q");
const HttpProvider = TronWeb.providers.HttpProvider;
const fullNode = new HttpProvider("https://api.shasta.trongrid.io");
const solidityNode = new HttpProvider("https://api.shasta.trongrid.io");
const eventServer = new HttpProvider("https://api.shasta.trongrid.io");

const OWNER_PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;
const OWNER_ADDRESS = process.env.OWNER_ADDRESS;
const MARKETPLACE_CONTRACT_ADDRESS = process.env.MARKETPLACE_CONTRACT_ADDRESS;
const TOKEN_CONTRACT_ADDRESS = process.env.TOKEN_CONTRACT_ADDRESS;

// utility functions
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };
  res.cookie("jwt", token, cookieOptions);
  user.password = undefined;
  user.privateKey = undefined;
  res.status(statusCode).json({
    status: "success",
    token,
  });
};

const createNewWallet = async () => {
  let privateKey;
  let hexAddress;
  let address;
  await sdk.generateaddress().then((res) => {
    privateKey = res.privateKey;
    hexAddress = res.hexAddress;
    address = res.address;
    // console.log(res);
  });

  await sdk
    .validateaddress({
      address: hexAddress,
    })
    // .then((res) => console.log(res))
    .catch((err) => console.error(err));

  const tronWeb = new TronWeb(fullNode, solidityNode, eventServer, privateKey);
  const ownerTronWeb = new TronWeb(
    fullNode,
    solidityNode,
    eventServer,
    OWNER_PRIVATE_KEY
  );
  await sdk
    .easytransferbyprivate({
      privateKey: OWNER_PRIVATE_KEY,
      toAddress: hexAddress,
      amount: 500000000,
    })
    // .then((res) => console.log("transfer res", res))
    .catch((err) => console.error(err));

  const ownerTokenContract = await ownerTronWeb
    .contract()
    .at(TOKEN_CONTRACT_ADDRESS);

  await ownerTokenContract.transfer(address, 1000).send();

  const tokenContract = await tronWeb.contract().at(TOKEN_CONTRACT_ADDRESS);

  await tokenContract
    .approve(MARKETPLACE_CONTRACT_ADDRESS, "999999999999999999")
    .send();

  return { privateKey, hexAddress, address };
};

const isOwnerUtil = async (nftAddress, hexAddress, tokenId) => {
  const ownerTronWeb = new TronWeb(
    fullNode,
    solidityNode,
    eventServer,
    OWNER_PRIVATE_KEY
  );
  const nftContract = await ownerTronWeb.contract().at(nftAddress);
  const ownerAddress = await nftContract.ownerOf(tokenId).call();
  return ownerAddress === hexAddress;
};

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.protect = async (req, res, next) => {
  try {
    // Getting token and check of it's there
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        status: "failed",
        message: "You are not logged in",
      });
    }

    // Verification token
    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select(
      "privateKey address email hexAddress"
    );

    if (!user)
      return res.status(401).json({
        status: "failed",
        message: "the user belonging to this token does no longer exist",
      });

    req.user = user;

    next();
  } catch (error) {
    return res.status(500).json({
      status: "error occured!",
      data: {
        error,
      },
    });
  }
};

// handlers

exports.getUser = async (req, res) => {
  const user = await User.findById(req.body.id);

  res.status(200).json({
    status: "success",
    data: { user },
  });
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // check if email and password exist
    if (!email || !password)
      return res.status(404).json({
        status: "failed",
        message: "User not found!",
      });

    // check if the user exists && password is correct
    const user = await User.findOne({ email, password }).select("+password");

    if (!user)
      return res.status(404).json({
        status: "failed",
        message: "User not found!",
      });

    // if everything ok, send token to client
    createSendToken(user, 200, res);
  } catch (error) {
    return res.status(500).json({
      status: "error occured!",
      data: {
        error,
      },
    });
  }
};

exports.signUp = async (req, res, next) => {
  try {
    const { privateKey, hexAddress, address } = await createNewWallet();
    const newUser = await User.create({
      email: req.body.email,
      password: req.body.password,
      privateKey,
      hexAddress,
      address,
    });
    createSendToken(newUser, 201, res);
  } catch (error) {
    return res.status(500).json({
      status: "error occured!",
      data: {
        error,
      },
    });
  }
};

exports.getBids = async (req, res) => {
  try {
    const { nftAddress, tokenId } = req.body;

    if (!nftAddress || !tokenId) {
      return res.status(500).json({
        status: "nftAddress and tokenId are required!",
      });
    }
    const tronWeb = new TronWeb(
      fullNode,
      solidityNode,
      eventServer,
      OWNER_PRIVATE_KEY
    );
    const MarketplaceContract = await tronWeb
      .contract()
      .at(MARKETPLACE_CONTRACT_ADDRESS);

    const getBids = await MarketplaceContract.bids(nftAddress, tokenId).call();

    res.status(200).json({
      status: "success",
      bidder: getBids.bidder,
      amount: tronWeb.toDecimal(getBids.amount),
      bidTime: tronWeb.toDecimal(getBids.bidTime),
    });
  } catch (error) {
    return res.status(500).json({
      status: "error occured!",
      data: {
        error,
      },
    });
  }
};

exports.giveBid = async (req, res) => {
  try {
    const { amount, nftAddress, tokenId } = req.body;

    if (!nftAddress || !amount || !tokenId) {
      return res.status(500).json({
        status: "nftAddress, tokenId and amount  are required!",
      });
    }
    const { privateKey } = req.user;

    const tronWeb = new TronWeb(
      fullNode,
      solidityNode,
      eventServer,
      privateKey
    );

    const MarketplaceContract = await tronWeb
      .contract()
      .at(MARKETPLACE_CONTRACT_ADDRESS);

    const giveBid = await MarketplaceContract.giveBid(
      nftAddress,
      tokenId,
      amount
    ).send();

    res.status(200).json({
      status: "success",
      result: giveBid,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error occured!",
      data: {
        error,
      },
    });
  }
};

exports.isOwner = async (req, res) => {
  try {
    const { nftAddress, tokenId } = req.body;
    if (!nftAddress || !tokenId) {
      return res.status(500).json({
        status: "nftAddress and tokenId are required!",
      });
    }
    const { hexAddress } = req.user;

    const isOwner = await isOwnerUtil(nftAddress, hexAddress, tokenId);

    res.status(200).json({
      status: "success",
      data: {
        isOwner,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: "error occured!",
      data: {
        error,
      },
    });
  }
};

exports.acceptBid = async (req, res) => {
  try {
    const { nftAddress, tokenId } = req.body;
    if (!nftAddress || !tokenId) {
      return res.status(500).json({
        status: "nftAddress and tokenId are required!",
      });
    }
    const { privateKey, hexAddress, address } = req.user;
    console.log(address);
    const isOwner = await isOwnerUtil(nftAddress, hexAddress, tokenId);
    if (!isOwner) {
      return res.status(500).json({
        status: "failed",
        message: "Must be owner for accepting bid!",
      });
    }
    const tronWeb = new TronWeb(
      fullNode,
      solidityNode,
      eventServer,
      privateKey
    );

    const MarketplaceContract = await tronWeb
      .contract()
      .at(MARKETPLACE_CONTRACT_ADDRESS);

    const acceptBid = await MarketplaceContract.acceptBid(
      nftAddress,
      tokenId
    ).send();
    res.status(200).json({
      status: "success",
      result: acceptBid,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error occured!",
      data: {
        error,
      },
    });
  }
};

exports.transfer = async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) {
      return res.status(500).json({
        status: "amount is required!",
      });
    }

    const { privateKey } = req.user;

    const tronWeb = new TronWeb(
      fullNode,
      solidityNode,
      eventServer,
      privateKey
    );
    const tokenContract = await tronWeb.contract().at(TOKEN_CONTRACT_ADDRESS);

    const result = await tokenContract.transfer(OWNER_ADDRESS, amount).send();

    res.status(200).json({
      status: "success",
      result,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      status: "error occured!",
      data: {
        error,
      },
    });
  }
};
